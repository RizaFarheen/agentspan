package cmd

import (
	"github.com/openagent/cli/client"
	"github.com/openagent/cli/config"
)

func getConfig() *config.Config {
	cfg := config.Load()
	if serverURL != "" {
		cfg.ServerURL = serverURL
	}
	return cfg
}

func newClient(cfg *config.Config) *client.Client {
	return client.New(cfg)
}
