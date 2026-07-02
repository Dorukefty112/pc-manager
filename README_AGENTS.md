# Instructions for AI Agents: Running this project on WSL

This project uses Linux-specific features (such as `systemd`, `pacman`, Docker, Linux firewalls, etc.) and **MUST** be run inside **WSL (Windows Subsystem for Linux)**.

Since you are running on a Windows host, you cannot execute standard Linux commands directly in Windows CMD or PowerShell. Instead, you must run them through the WSL wrapper.

## Path Mapping
- Windows Path: `C:\Users\Doruk\Desktop\pc-manager-master`
- WSL Path: `/mnt/c/Users/Doruk/Desktop/pc-manager-master`

## How to Edit Files
You can edit files directly using Windows paths (e.g., `C:\Users\Doruk\Desktop\pc-manager-master\frontend\src\pages\Settings.jsx`). Changes are instantly reflected in WSL.

## How to Run Commands inside WSL (via Windows Host)

If you have a terminal tool (`run_command` or similar) executing on the Windows host, wrap your commands using `wsl`:

### 1. Setup Backend
```bash
wsl bash -c "cd /mnt/c/Users/Doruk/Desktop/pc-manager-master && python3 -m venv venv && ./venv/bin/pip install -r backend/requirements.txt"
```

### 2. Run Backend (FastAPI)
```bash
wsl bash -c "cd /mnt/c/Users/Doruk/Desktop/pc-manager-master/backend && ../venv/bin/python main.py"
```

### 3. Setup Frontend
```bash
wsl bash -c "cd /mnt/c/Users/Doruk/Desktop/pc-manager-master/frontend && npm install"
```

### 4. Run Frontend (Vite)
```bash
wsl bash -c "cd /mnt/c/Users/Doruk/Desktop/pc-manager-master/frontend && npm run dev"
```

## Accessing the App
WSL forwards localhost ports to the Windows host automatically. You can access:
- Frontend: `http://localhost:5173` (or the port specified by Vite)
- Backend: `http://localhost:8000` (or the port specified by FastAPI)
