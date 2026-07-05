package main

import (
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/tilzio/tilzio/internal/plugins"
)

// viewBridgePrelude — a mini-SDK for a plugin iframe (mirror of WORKER_PRELUDE, but for the UI).
// Injected into any text/html under /plugins/. Sandbox without same-origin → the iframe
// origin is opaque ('null'); communication with the host is only via postMessage. Envelope __tsview.
const viewBridgePrelude = `<script>(function(){var cbs=[];window.host={post:function(m){parent.postMessage({__tsview:1,data:m},'*');},onMessage:function(cb){cbs.push(cb);return function(){var i=cbs.indexOf(cb);if(i>=0)cbs.splice(i,1);};}};window.addEventListener('message',function(e){var d=e.data;if(!d||d.__tsview!==1)return;for(var i=0;i<cbs.length;i++){try{cbs[i](d.data);}catch(_){}}});})();</script>`

// NewPluginAssetHandler wraps the frontend asset-handler: paths /plugins/<id>/<rel>
// are served from the plugin's folder (securejoin in plugins.Service.ReadFile); everything
// else is delegated to next. For text/html the bridge prelude is injected; CSP is set on everything.
func NewPluginAssetHandler(svc *plugins.Service, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const prefix = "/plugins/"
		if !strings.HasPrefix(r.URL.Path, prefix) {
			next.ServeHTTP(w, r)
			return
		}
		rest := strings.TrimPrefix(r.URL.Path, prefix)
		slash := strings.IndexByte(rest, '/')
		if slash <= 0 {
			http.NotFound(w, r)
			return
		}
		id, rel := rest[:slash], rest[slash+1:]
		data, err := svc.ReadFile(id, rel) // securejoin + size cap (loader.secureRead)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		ctype := mime.TypeByExtension(filepath.Ext(rel))
		if ctype == "" {
			ctype = "application/octet-stream"
		}
		net := svc.HasPermission(id, "network")
		w.Header().Set("Content-Type", ctype)
		w.Header().Set("Content-Security-Policy", pluginCSP(net, cspOrigin(r)))
		if strings.HasPrefix(ctype, "text/html") {
			data = injectViewBridge(data)
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		_, _ = w.Write(data)
	})
}

// cspOrigin — the actual origin of the request (works in dev, in prod, and with an
// opaque-origin iframe: a plugin's own files are loaded via an explicit <origin>, not 'self').
func cspOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

// pluginCSP builds each directive EXACTLY once (duplicate directives in CSP are ignored —
// the first one wins). net=true (the "network" permission) relaxes network/media, but NOT
// script-src/style-src (external code is never allowed, even with network — a narrow surface).
func pluginCSP(net bool, origin string) string {
	connect, media := "'none'", "'none'"
	img := origin + " data:"
	font := origin + " data:"
	if net {
		connect, media = "https:", "https:"
		img = origin + " https: data:"
		font = origin + " https: data:"
	}
	return strings.Join([]string{
		"default-src 'none'",
		"script-src 'unsafe-inline' " + origin,
		"style-src 'unsafe-inline' " + origin,
		"img-src " + img,
		"font-src " + font,
		"media-src " + media,
		"connect-src " + connect,
		"frame-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
	}, "; ")
}

// injectViewBridge inserts the prelude after <head> (otherwise after <body>, otherwise at the start).
func injectViewBridge(html []byte) []byte {
	s := string(html)
	low := strings.ToLower(s)
	for _, tag := range []string{"<head>", "<body>"} {
		if i := strings.Index(low, tag); i >= 0 {
			at := i + len(tag)
			return []byte(s[:at] + viewBridgePrelude + s[at:])
		}
	}
	return []byte(viewBridgePrelude + s)
}
