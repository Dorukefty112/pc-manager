import pytest
from routers import notifications as n


@pytest.fixture(autouse=True)
def clean(tmp_path, monkeypatch):
    monkeypatch.setattr(n, "HISTORY_PATH", tmp_path / "history.json")
    n._rule_state.clear()
    yield
    n._rule_state.clear()


def _rule(**kw):
    return n.validate_rule({"id": "r1", "name": "CPU", "metric": "cpu", "op": ">", "threshold": 80,
                            "duration": 60, "cooldown": 10, **kw})


class Feed:
    def __init__(self):
        self.hit = False
        self.sent = []

    def reader(self, rule):
        return self.hit, "95.0%" if self.hit else "10.0%"

    def send(self, subject, msg, channels):
        self.sent.append(subject)
        return ["test"]


def _run(feed, rule, now):
    n.evaluate_rules([rule], {}, now=now, reader=feed.reader, send=feed.send)


def test_fires_only_after_duration():
    f, r = Feed(), _rule()
    f.hit = True
    _run(f, r, 1000)
    _run(f, r, 1030)
    assert f.sent == []
    _run(f, r, 1060)
    assert len(f.sent) == 1 and "Alarm" in f.sent[0]


def test_brief_spike_does_not_fire():
    f, r = Feed(), _rule()
    f.hit = True
    _run(f, r, 1000)
    f.hit = False
    _run(f, r, 1030)
    f.hit = True
    _run(f, r, 1060)
    assert f.sent == []


def test_no_spam_then_reminder_after_cooldown():
    f, r = Feed(), _rule(duration=0, cooldown=10)
    f.hit = True
    for t in range(1000, 1000 + 9 * 60, 30):
        _run(f, r, t)
    assert len(f.sent) == 1
    _run(f, r, 1000 + 10 * 60)
    assert len(f.sent) == 2 and "Devam ediyor" in f.sent[1]


def test_resolved_notification_and_history():
    f, r = Feed(), _rule(duration=0)
    f.hit = True
    _run(f, r, 1000)
    f.hit = False
    _run(f, r, 1030)
    assert "Düzeldi" in f.sent[-1]
    hist = n._load_history()
    assert [h["state"] for h in hist] == ["resolved", "firing"]
    assert hist[0]["rule_id"] == "r1" and hist[0]["sent_to"] == ["test"]


def test_resolved_can_be_disabled():
    f, r = Feed(), _rule(duration=0, notify_resolved=False)
    f.hit = True
    _run(f, r, 1000)
    f.hit = False
    _run(f, r, 1030)
    assert len(f.sent) == 1


def test_disabled_rule_ignored():
    f, r = Feed(), _rule(duration=0, enabled=False)
    f.hit = True
    _run(f, r, 1000)
    assert f.sent == []


def test_unreadable_metric_keeps_state():
    f, r = Feed(), _rule(duration=0)
    f.hit = None
    _run(f, r, 1000)
    assert f.sent == []


def test_history_is_capped():
    f, r = Feed(), _rule(duration=0, cooldown=1)
    f.hit = True
    for i in range(n.HISTORY_LIMIT + 20):
        _run(f, r, 1000 + i * 60)
    assert len(n._load_history()) == n.HISTORY_LIMIT


def test_validation():
    with pytest.raises(ValueError):
        n.validate_rule({"metric": "nope"})
    with pytest.raises(ValueError):
        n.validate_rule({"metric": "service"})
    with pytest.raises(ValueError):
        n.validate_rule({"metric": "http", "target": "ftp://x"})
    assert n.validate_rule({"metric": "disk"})["target"] == "/"


def test_defaults_follow_legacy_thresholds():
    rules = n.get_rules({"notifications": {"cpu_threshold": 75}})
    assert {r["metric"] for r in rules} == {"cpu", "memory", "disk"}
    assert next(r for r in rules if r["metric"] == "cpu")["threshold"] == 75


def test_real_reader_cpu_and_process():
    hit, value = n.read_rule(n.validate_rule({"metric": "cpu", "threshold": 1000}))
    assert hit is False and value.endswith("%")
    hit, _ = n.read_rule(n.validate_rule({"metric": "process", "target": "bu-surec-yok-xyz"}))
    assert hit is True
