# Gunicorn production configuration for Smart Slot backend
# Run with: gunicorn -c gunicorn.conf.py main:app

import multiprocessing

# ── Binding ───────────────────────────────────────────────────────────────────
bind = "0.0.0.0:5000"

# ── Workers ───────────────────────────────────────────────────────────────────
# 2*cpu + 1 is the standard recommended formula for sync worker class
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "sync"
threads = 1

# ── Timeouts ──────────────────────────────────────────────────────────────────
# Timetable generation can be slow — keep timeout generous
timeout = 120
graceful_timeout = 30
keepalive = 5

# ── Logging ───────────────────────────────────────────────────────────────────
loglevel = "info"
accesslog = "-"   # stdout
errorlog  = "-"   # stderr
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(D)sµs'

# ── Lifecycle ─────────────────────────────────────────────────────────────────
preload_app = True   # share DB connection setup across fork

def on_starting(server):
    server.log.info("Smart Slot — Gunicorn starting up")

def worker_exit(server, worker):
    server.log.info("Worker %s exiting", worker.pid)
