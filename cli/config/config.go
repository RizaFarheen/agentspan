package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	ServerURL string `json:"server_url"`
	AuthKey   string `json:"auth_key,omitempty"`
	AuthSecret string `json:"auth_secret,omitempty"`
}

func DefaultConfig() *Config {
	return &Config{
		ServerURL: "http://localhost:8080",
	}
}

func configDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".openagent")
}

func configPath() string {
	return filepath.Join(configDir(), "config.json")
}

func Load() *Config {
	cfg := DefaultConfig()

	// Env vars override
	if url := os.Getenv("AGENT_SERVER_URL"); url != "" {
		cfg.ServerURL = url
	}
	if key := os.Getenv("CONDUCTOR_AUTH_KEY"); key != "" {
		cfg.AuthKey = key
	}
	if secret := os.Getenv("CONDUCTOR_AUTH_SECRET"); secret != "" {
		cfg.AuthSecret = secret
	}

	// File overrides (env vars take precedence)
	data, err := os.ReadFile(configPath())
	if err != nil {
		return cfg
	}
	var fileCfg Config
	if json.Unmarshal(data, &fileCfg) == nil {
		if cfg.ServerURL == "http://localhost:8080" && fileCfg.ServerURL != "" {
			cfg.ServerURL = fileCfg.ServerURL
		}
		if cfg.AuthKey == "" && fileCfg.AuthKey != "" {
			cfg.AuthKey = fileCfg.AuthKey
		}
		if cfg.AuthSecret == "" && fileCfg.AuthSecret != "" {
			cfg.AuthSecret = fileCfg.AuthSecret
		}
	}

	return cfg
}

func Save(cfg *Config) error {
	dir := configDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), data, 0o600)
}
