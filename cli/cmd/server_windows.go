// Copyright (c) 2025 AgentSpan
// Licensed under the MIT License. See LICENSE file in the project root for details.

//go:build windows

package cmd

import (
	"os"
	"syscall"
)

func sysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{}
}

func killProcess(process *os.Process) error {
	return process.Kill()
}

func processRunning(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Windows, FindProcess always succeeds; try to open the process
	err = process.Signal(os.Kill)
	if err != nil {
		return false
	}
	return true
}
