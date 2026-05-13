import psutil
import time
from fastapi import APIRouter

router = APIRouter(tags=["network"])

@router.get("/network/interfaces")
def get_interfaces():
    ifaces = []
    for name, addrs in psutil.net_if_addrs().items():
        ips = []
        for addr in addrs:
            ips.append({"family": str(addr.family), "address": addr.address, "netmask": addr.netmask})
        ifaces.append({"name": name, "addresses": ips})
    return ifaces

_prev_net = None
_prev_time = None

@router.get("/network/stats")
def get_net_stats():
    global _prev_net, _prev_time
    now = time.time()
    current = psutil.net_io_counters()
    speed_down = speed_up = 0
    if _prev_net and _prev_time:
        elapsed = now - _prev_time
        if elapsed > 0:
            speed_down = (current.bytes_recv - _prev_net.bytes_recv) / elapsed
            speed_up = (current.bytes_sent - _prev_net.bytes_sent) / elapsed
    _prev_net = current
    _prev_time = now
    return {
        "bytes_sent": current.bytes_sent,
        "bytes_recv": current.bytes_recv,
        "packets_sent": current.packets_sent,
        "packets_recv": current.packets_recv,
        "speed_down_bps": speed_down,
        "speed_up_bps": speed_up,
    }
