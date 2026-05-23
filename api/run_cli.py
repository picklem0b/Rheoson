#!/usr/bin/env python3
"""Root-level shortcut: python run_cli.py [args]"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))
from app.cli import main
main()