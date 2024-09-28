@echo off

node --inspect-brk --loader ts-node/esm --no-warnings=ExperimentalWarning "%~dp0\dev" %*