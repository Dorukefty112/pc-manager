import os, shutil, subprocess, json, re
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["firewall_native"])


def _detect_firewall():
    for name, cmd in [("nftables", ["nft", "--version"]), ("iptables", ["iptables", "--version"])]:
        try:
            r = subprocess.run(["sudo"] + cmd, capture_output=True, text=True, timeout=3)
            if r.returncode == 0:
                return name
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
    return None


def _run_cmd(cmd: list) -> str:
    try:
        result = subprocess.run(["sudo"] + cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            raise HTTPException(400, result.stderr.strip() or "Komut hatasi")
        return result.stdout.strip()
    except FileNotFoundError:
        raise HTTPException(400, "Komut bulunamadi")
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Komut zaman asimi")


def _parse_nftables_rules(output):
    rules = []
    current_table = None
    current_chain = None
    for line in output.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("table "):
            parts = stripped.split()
            if len(parts) >= 3:
                current_table = f"{parts[1]} {parts[2].rstrip('{').strip()}"
            current_chain = None
        elif re.match(r"chain\s+\S+", stripped) and "{" in stripped:
            m = re.match(r"chain\s+(\S+)", stripped)
            if m:
                current_chain = m.group(1).rstrip("{").strip()
        elif "# handle" in stripped and not stripped.startswith("table") and not stripped.startswith("chain") and not stripped.startswith("type") and not stripped.startswith("policy"):
            h_match = re.search(r"# handle (\d+)", stripped)
            handle = int(h_match.group(1)) if h_match else 0
            rule_text = re.sub(r"# handle \d+", "", stripped).strip()
            rules.append({
                "table": current_table,
                "chain": current_chain,
                "handle": handle,
                "rule": rule_text,
            })
    return rules


def _parse_iptables_rules(output):
    rules = []
    current_chain = None
    for line in output.split("\n"):
        if line.startswith("Chain "):
            m = re.match(r"Chain\s+(\S+)", line)
            if m:
                current_chain = m.group(1)
        elif re.match(r"^\s*\d+", line):
            parts = line.split()
            if len(parts) >= 7:
                rules.append({
                    "table": "filter",
                    "chain": current_chain,
                    "line": int(parts[0]),
                    "target": parts[1],
                    "prot": parts[2],
                    "source": parts[4],
                    "destination": parts[5],
                    "rule": " ".join(parts[6:]),
                })
    return rules


@router.get("/firewall/native/status")
def get_native_status():
    fw = _detect_firewall()
    if not fw:
        return {"firewall": None, "status": "none", "active_rules": 0}

    active_rules = 0
    if fw == "nftables":
        try:
            output = _run_cmd(["nft", "-a", "list", "ruleset"])
            rules = _parse_nftables_rules(output)
            active_rules = len(rules)
        except Exception:
            pass
    else:
        try:
            output = _run_cmd(["iptables", "-L", "-n", "--line-numbers"])
            rules = _parse_iptables_rules(output)
            active_rules = len(rules)
        except Exception:
            pass

    return {"firewall": fw, "status": "active", "active_rules": active_rules}


@router.get("/firewall/native/rules")
def list_native_rules():
    fw = _detect_firewall()
    if not fw:
        return {"firewall": None, "rules": []}

    if fw == "nftables":
        output = _run_cmd(["nft", "-a", "list", "ruleset"])
        rules = _parse_nftables_rules(output)
    else:
        output = _run_cmd(["iptables", "-L", "-n", "--line-numbers"])
        rules = _parse_iptables_rules(output)

    return {"firewall": fw, "rules": rules}


@router.post("/firewall/native/rule")
def add_native_rule(body: dict):
    fw = _detect_firewall()
    if not fw:
        raise HTTPException(400, "nftables veya iptables kurulu degil")

    table = body.get("table", "filter")
    chain = body.get("chain", "INPUT")
    action = body.get("action", "accept")
    protocol = body.get("protocol", "")
    port = body.get("port", "")
    source = body.get("source", "")
    destination = body.get("destination", "")

    if fw == "nftables":
        family = body.get("family", "inet")
        parts = []
        if protocol:
            parts.append(protocol)
        if port:
            parts.extend(["dport", str(port)])
        if source:
            parts.extend(["ip", "saddr", source])
        if destination:
            parts.extend(["ip", "daddr", destination])
        parts.append(action)
        cmd = ["nft", "add", "rule", family, table, chain] + parts
        _run_cmd(cmd)
        return {"success": True, "message": f"nftables kurali eklendi: {' '.join(parts)}"}
    else:
        cmd = ["iptables", "-A", chain]
        if protocol:
            cmd.extend(["-p", protocol])
        if source:
            cmd.extend(["-s", source])
        if destination:
            cmd.extend(["-d", destination])
        if port:
            cmd.extend(["--dport", str(port)])
        jump = {"accept": "ACCEPT", "allow": "ACCEPT", "drop": "DROP", "reject": "REJECT"}.get(action, action.upper())
        cmd.extend(["-j", jump])
        _run_cmd(cmd)
        return {"success": True, "message": f"iptables kurali eklendi: {' '.join(cmd[1:])}"}


@router.delete("/firewall/native/rule")
def delete_native_rule(body: dict):
    fw = _detect_firewall()
    if not fw:
        raise HTTPException(400, "nftables veya iptables kurulu degil")

    table = body.get("table", "filter")
    chain = body.get("chain", "INPUT")
    handle = body.get("handle", 0)
    line = body.get("line", 0)

    if fw == "nftables":
        family = body.get("family", "inet")
        if not handle:
            raise HTTPException(400, "handle numarasi gerekli")
        _run_cmd(["nft", "delete", "rule", family, table, chain, "handle", str(handle)])
        return {"success": True, "message": f"nftables kurali silindi (handle: {handle})"}
    else:
        if not line:
            raise HTTPException(400, "satir numarasi gerekli")
        _run_cmd(["iptables", "-D", chain, str(line)])
        return {"success": True, "message": f"iptables kurali silindi (satir: {line})"}


@router.post("/firewall/native/flush")
def flush_native_chain(body: dict):
    fw = _detect_firewall()
    if not fw:
        raise HTTPException(400, "nftables veya iptables kurulu degil")

    table = body.get("table", "filter")
    chain = body.get("chain", "INPUT")

    if fw == "nftables":
        family = body.get("family", "inet")
        _run_cmd(["nft", "flush", "rule", family, table, chain])
        return {"success": True, "message": f"nftables {table}/{chain} temizlendi"}
    else:
        _run_cmd(["iptables", "-F", chain])
        return {"success": True, "message": f"iptables {chain} temizlendi"}


@router.get("/firewall/native/tables")
def list_native_tables():
    fw = _detect_firewall()
    if not fw:
        return {"firewall": None, "tables": []}

    tables = []
    if fw == "nftables":
        output = _run_cmd(["nft", "list", "tables"])
        for line in output.split("\n"):
            line = line.strip()
            if line.startswith("table "):
                parts = line.split()
                if len(parts) >= 3:
                    family = parts[1]
                    tbl = parts[2]
                    try:
                        chain_output = _run_cmd(["nft", "list", "table", family, tbl])
                        chains = []
                        for cl in chain_output.split("\n"):
                            cm = re.match(r"chain\s+(\S+)", cl.strip())
                            if cm:
                                chains.append(cm.group(1).rstrip("{").strip())
                        tables.append({
                            "name": f"{family} {tbl}",
                            "family": family,
                            "table": tbl,
                            "chains": chains,
                        })
                    except Exception:
                        tables.append({
                            "name": f"{family} {tbl}",
                            "family": family,
                            "table": tbl,
                            "chains": [],
                        })
    else:
        output = _run_cmd(["iptables", "-L"])
        chains = []
        for line in output.split("\n"):
            m = re.match(r"Chain\s+(\S+)", line)
            if m:
                chains.append(m.group(1))
        tables.append({
            "name": "filter",
            "family": "ipv4",
            "table": "filter",
            "chains": chains,
        })

    return {"firewall": fw, "tables": tables}
