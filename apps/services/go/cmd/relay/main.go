// Command relay is the Rheoson byte relay.
//
// It owns exactly one job: turn a track id into bytes on the wire. It resolves
// through whatever the server points it at, mirrors range semantics from the
// CDN, tees whole files to disk, and reports upstream failures instead of
// raising them.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/rheoson/relay/internal/cache"
	"github.com/rheoson/relay/internal/config"
	"github.com/rheoson/relay/internal/relay"
	"github.com/rheoson/relay/internal/resolver"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	cfg := config.Load()
	c := cache.New(cfg.CacheDir)
	res := resolver.New(cfg.ResolverURL, cfg.Token, cfg.ResolveTimeout)
	handler := relay.NewHandler(cfg, res, c, log)

	server := &http.Server{
		Addr:              ":" + strconv.Itoa(cfg.Port),
		Handler:           handler.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout: a long track is a healthy request.
		IdleTimeout: 120 * time.Second,
	}

	// Boot facts, once — enough to diagnose a misconfigured container from
	// the log alone, without dumping the environment.
	log.Info("relay listening",
		"port", cfg.Port,
		"cacheDir", cfg.CacheDir,
		"cacheEnabled", c.Enabled(),
		"resolverConfigured", res.Configured(),
		"tokenRequired", cfg.Token != "",
	)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	errs := make(chan error, 1)
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errs <- err
		}
	}()

	select {
	case err := <-errs:
		log.Error("relay failed", "error", err.Error())
		os.Exit(1)
	case <-stop:
		log.Info("relay shutting down")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		// In-flight streams are allowed to finish; only the listener stops.
		if err := server.Shutdown(ctx); err != nil {
			log.Error("relay shutdown incomplete", "error", err.Error())
		}
	}
}
