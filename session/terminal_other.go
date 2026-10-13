//go:build unix && !linux

package main

import "syscall"

const getTermios = syscall.TIOCGETA
