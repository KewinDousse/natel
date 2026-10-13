//go:build unix

package main

import (
	"log/slog"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"
)

// stopTimeout is a variable so tests can shorten it.
var stopTimeout = 10 * time.Second

// process is the child natel-session runs: Caddy, in the image.
type process struct {
	proc   *os.Process
	exited chan int
}

// start runs the command with this process's output, and reaps every child
// that exits, as PID 1 must: Caddy's own orphans are reparented to it.
// The child's status is read by the reaper, never by cmd.Wait.
func start(command []string) (*process, error) {
	children := make(chan os.Signal, 1)
	signal.Notify(children, syscall.SIGCHLD)
	cmd := exec.Command(command[0], command[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		signal.Stop(children)
		return nil, err
	}
	p := &process{proc: cmd.Process, exited: make(chan int, 1)}
	go p.reap(children)
	return p, nil
}

func (p *process) reap(children <-chan os.Signal) {
	for {
		for {
			var status syscall.WaitStatus
			pid, err := syscall.Wait4(-1, &status, syscall.WNOHANG, nil)
			if err == syscall.EINTR {
				continue
			}
			if pid <= 0 || err != nil {
				break
			}
			if pid == p.proc.Pid {
				p.exited <- exitCode(status)
				return
			}
		}
		<-children
	}
}

func exitCode(status syscall.WaitStatus) int {
	if status.Signaled() {
		return 128 + int(status.Signal())
	}
	return status.ExitStatus()
}

func (p *process) signal(sig os.Signal) {
	_ = p.proc.Signal(sig)
}

// stop asks the child to stop, then kills it if it hasn't within the timeout.
func (p *process) stop(log *slog.Logger) {
	p.signal(syscall.SIGTERM)
	select {
	case code := <-p.exited:
		log.Info("child process exited", "code", code)
	case <-time.After(stopTimeout):
		log.Warn("child process killed after the stop timeout")
		p.signal(syscall.SIGKILL)
		log.Info("child process exited", "code", <-p.exited)
	}
}
