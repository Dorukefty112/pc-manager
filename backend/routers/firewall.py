import re
import subprocess
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["firewall"])

def _run_ufw(args: list) -> str:
    try:
        result = subprocess.run(["sudo"] + args, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            raise HTTPException(400, result.stderr.strip() or "UFW hatasi")
        return result.stdout.strip()
    except FileNotFoundError:
        raise HTTPException(400, "UFW kurulu degil (sudo ufw)")
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Komut zaman asimi")


@router.get("/firewall/status")
def get_firewall_status():
    try:
        raw = _run_ufw(["ufw", "status", "verbose"])
    except HTTPException:
        try:
            result = subprocess.run(["sudo", "ufw", "status"], capture_output=True, text=True, timeout=5)
            if "command not found" in (result.stdout + result.stderr):
                raise HTTPException(400, "UFW kurulu degil")
            raw = result.stdout.strip()
        except FileNotFoundError:
            raise HTTPException(400, "UFW kurulu degil")

    lines = raw.split("\n")
    status = "inactive"
    rules = []
    default_in = ""
    default_out = ""
    logging = ""

    for line in lines:
        line = line.strip()
        if "Status:" in line:
            status = line.split(":")[-1].strip().lower()
        elif "Default:" in line:
            if "incoming" in line:
                default_in = line.split("incoming")[-1].strip()
            if "outgoing" in line:
                default_out = line.split("outgoing")[-1].strip()
        elif "Logging:" in line:
            logging = line.split(":")[-1].strip()
        elif re.match(r"^\d", line) or re.match(r"^[A-Z]", line):
            parts = line.split()
            if len(parts) >= 2:
                rules.append(line)

    return {
        "status": status,
        "default_incoming": default_in,
        "default_outgoing": default_out,
        "logging": logging,
        "rules": rules,
        "raw": raw,
    }


@router.post("/firewall/toggle")
def toggle_firewall(body: dict):
    action = body.get("action", "status")
    if action == "enable":
        _run_ufw(["ufw", "--force", "enable"])
        return {"success": True, "message": "Guvenlik duvari etkinlestirildi"}
    elif action == "disable":
        _run_ufw(["ufw", "--force", "disable"])
        return {"success": True, "message": "Guvenlik duvari devre disi birakildi"}
    elif action == "reload":
        _run_ufw(["ufw", "reload"])
        return {"success": True, "message": "Guvenlik duvari yeniden yuklendi"}
    elif action == "reset":
        _run_ufw(["ufw", "--force", "reset"])
        return {"success": True, "message": "Guvenlik duvari sifirlandi"}
    raise HTTPException(400, "Gecersiz aksiyon (enable/disable/reload/reset)")


@router.post("/firewall/rule")
def add_rule(body: dict):
    rule_type = body.get("type", "allow")
    direction = body.get("direction", "in")
    port = body.get("port", "")
    protocol = body.get("protocol", "")
    ip = body.get("ip", "")

    if not port and not ip:
        raise HTTPException(400, "Port veya IP adresi gerekli")

    args = ["ufw", rule_type, direction]
    if port:
        if protocol:
            port = f"{port}/{protocol}"
        args.append(port)
    if ip:
        if port:
            args.append("from" if direction == "in" else "to")
            args.append(ip)
        else:
            args.append(f"from {ip}" if direction == "in" else f"to {ip}")

    _run_ufw(args)
    return {"success": True, "message": f"Kural eklendi: {' '.join(args[1:])}"}


@router.delete("/firewall/rule")
def delete_rule(body: dict):
    rule_num = body.get("rule_num", 0)
    if not rule_num:
        raise HTTPException(400, "Kural numarasi gerekli")
    _run_ufw(["ufw", "--force", "delete", str(rule_num)])
    return {"success": True, "message": f"{rule_num}. kural silindi"}


@router.get("/firewall/rules")
def list_rules():
    try:
        raw = _run_ufw(["ufw", "status", "numbered"])
    except HTTPException:
        return {"rules": [], "raw": ""}
    lines = raw.split("\n")
    numbered = []
    for line in lines:
        m = re.match(r"^\s*\[\s*(\d+)\s*\]", line)
        if m:
            numbered.append({"num": int(m.group(1)), "text": line.strip()})
    return {"rules": numbered, "raw": raw}
