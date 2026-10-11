"""Sealed bundle-only imports. Python is invoked with -I -S -B; no site hooks."""
import sys
from pathlib import Path
import runpy

resources = Path(__file__).resolve(strict=True).parent
stdlib = resources / 'python/lib/python3.12'
sys.path[:] = [str(stdlib), str(stdlib / 'lib-dynload'), str(stdlib / 'site-packages')]
sys.dont_write_bytecode = True
runpy.run_path(str(resources / 'reader.py'), run_name='__main__')
