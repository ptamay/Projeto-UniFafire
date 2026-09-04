#!/usr/bin/env python3
"""Verifica que todo import de pacote externo resolve no ambiente atual (Gate 1 — Python).
Import que nao resolve = dependencia ausente ou alucinada pelo agente.
IMPORTANTE: rode com o MESMO interpretador/venv do projeto.
Saida: um nome de modulo nao-resolvivel por linha (vazio = tudo ok)."""
import ast
import os
from importlib.util import find_spec

SKIP_DIRS = {'.git', '.venv', 'venv', 'env', 'node_modules', '__pycache__',
             'dist', 'build', '.mypy_cache', '.pytest_cache', '.tox'}

# Modulos locais do repo (arquivos .py e pacotes) contam como resolviveis
local = set()
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for f in files:
        if f.endswith('.py'):
            local.add(os.path.splitext(f)[0])
    for d in dirs:
        local.add(d)

missing = set()
checked = {}
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for f in files:
        if not f.endswith('.py'):
            continue
        path = os.path.join(root, f)
        try:
            with open(path, encoding='utf-8', errors='replace') as fh:
                tree = ast.parse(fh.read())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                names = [node.module]
            for n in names:
                top = n.split('.')[0]
                if top in local or top in checked:
                    if checked.get(top) is False:
                        missing.add(top)
                    continue
                try:
                    ok = find_spec(top) is not None
                except (ImportError, ValueError, ModuleNotFoundError):
                    ok = False
                checked[top] = ok
                if not ok:
                    missing.add(top)

if missing:
    print('\n'.join(sorted(missing)))
