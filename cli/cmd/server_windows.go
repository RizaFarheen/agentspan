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
	// On Windows, FindProcess always succeeds. Signal(0) checks liveness
	// without terminating the process.
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

func getFreeDiskMB(path string) int64 {
	// Not easily available on Windows without unsafe; skip check
	return -1
}
