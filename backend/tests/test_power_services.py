import socket
import subprocess
import pytest
from routers import power, services


def test_magic_packet_layout():
    pkt = power.magic_packet("aa-bb-cc-dd-ee-ff")
    assert len(pkt) == 102
    assert pkt[:6] == b"\xff" * 6
    assert pkt[6:12] == bytes.fromhex("aabbccddeeff") and pkt[-6:] == bytes.fromhex("aabbccddeeff")


@pytest.mark.parametrize("mac,ok", [
    ("AA:BB:CC:DD:EE:FF", True), ("aabbccddeeff", True), ("aa-bb-cc-dd-ee-ff", True),
    ("AA:BB-CC:DD:EE:FF", False), ("AA:BB:CC:DD:EE", False), ("zz:bb:cc:dd:ee:ff", False),
])
def test_mac_validation(mac, ok):
    if ok:
        assert power.normalize_mac(mac) == "AA:BB:CC:DD:EE:FF"
    else:
        with pytest.raises(ValueError):
            power.normalize_mac(mac)


def test_send_magic_packet_over_udp():
    rx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    rx.bind(("127.0.0.1", 0))
    rx.settimeout(2)
    power.send_magic_packet("AA:BB:CC:DD:EE:FF", "127.0.0.1", rx.getsockname()[1])
    data, _ = rx.recvfrom(200)
    rx.close()
    assert data == power.magic_packet("AA:BB:CC:DD:EE:FF")


SHOW_OUTPUT = """Id=apt-daily.timer
Description=Daily apt download activities
ActiveState=active
UnitFileState=enabled
Unit=apt-daily.service
NextElapseUSecRealtime=Wed 2025-01-08 06:12:00 +03
LastTriggerUSec=Tue 2025-01-07 06:40:11 +03
TimersCalendar={ OnCalendar=*-*-* 06,18:00:00 ; next_elapse=Wed 2025-01-08 06:12:00 +03 }
TimersMonotonic=

Id=fstrim.timer
Description=Discard unused blocks once a week
ActiveState=inactive
UnitFileState=disabled
Unit=fstrim.service
NextElapseUSecRealtime=
LastTriggerUSec=n/a
TimersCalendar={ OnCalendar=weekly ; next_elapse=n/a }
TimersMonotonic=
"""


def test_list_timers_parses_systemctl(monkeypatch):
    def fake_run(cmd, **kw):
        out = "apt-daily.timer loaded active waiting x\nfstrim.timer loaded inactive dead y\n" if "list-units" in cmd else SHOW_OUTPUT
        return subprocess.CompletedProcess(cmd, 0, stdout=out, stderr="")
    monkeypatch.setattr(services.subprocess, "run", fake_run)
    timers = services.list_timers()
    assert [t["name"] for t in timers] == ["apt-daily.timer", "fstrim.timer"]
    apt, fst = timers
    assert apt["schedule"] == "*-*-* 06,18:00:00" and apt["activates"] == "apt-daily.service"
    assert apt["next"] and apt["last"] and apt["enabled"] == "enabled"
    assert fst["next"] is None and fst["last"] is None and fst["schedule"] == "weekly"


@pytest.mark.parametrize("bad", ["--root=/", "-h", "a b", "x;y", ""])
def test_unit_validation(bad):
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        services._unit(bad)
