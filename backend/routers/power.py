import os
import subprocess
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["power"])

def run_cmd(cmd):
    try:
        subprocess.run(cmd, check=True, timeout=5)
        return {"success": True}
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "command timed out")
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"command failed: {e}")

@router.post("/power/shutdown")
def shutdown():
    return run_cmd(["poweroff"])

@router.post("/power/reboot")
def reboot():
    return run_cmd(["reboot"])

@router.post("/power/suspend")
def suspend():
    return run_cmd(["systemctl", "suspend"])

@router.post("/power/logout")
def logout():
    return run_cmd(["loginctl", "terminate-user", os.getenv("USER", "kullanici")])
