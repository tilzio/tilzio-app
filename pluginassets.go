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
const viewBridgePrelude = `<script>(function(){var cbs=[];var TSK=/^--ts-[a-z-]+$/;function applyTheme(t){if(!t||typeof t!=='object')return;var r=document.documentElement;for(var k in t){if(TSK.test(k))r.style.setProperty(k,String(t[k]));}}window.host={post:function(m){parent.postMessage({__tsview:1,data:m},'*');},onMessage:function(cb){cbs.push(cb);return function(){var i=cbs.indexOf(cb);if(i>=0)cbs.splice(i,1);};}};window.addEventListener('message',function(e){if(e.source!==parent)return;var d=e.data;if(!d||d.__tsview!==1)return;var p=d.data;if(p&&p.type==='ts:theme'){applyTheme(p.tokens);return;}for(var i=0;i<cbs.length;i++){try{cbs[i](p);}catch(_){}}});})();</script>`

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

// injectViewBridge inserts the prelude right after the opening <head ...> tag
// (otherwise after <body ...>, otherwise at the start). Tags with attributes and
// any letter case are matched — a bare-"<head>"-only match would dump the
// prelude before <!doctype> and flip the iframe into quirks mode.
func injectViewBridge(html []byte) []byte {
	s := string(html)
	low := strings.ToLower(s)
	for _, tag := range []string{"<head", "<body"} {
		if at := openTagEnd(low, tag); at >= 0 {
			return []byte(s[:at] + viewBridgePrelude + s[at:])
		}
	}
	return []byte(viewBridgePrelude + s)
}

// openTagEnd returns the index just past the '>' of the first occurrence of tag
// (e.g. "<head") in low (a lowercased document). The tag name must be followed
// by '>' or whitespace, so "<header>" never matches "<head". Returns -1 when the
// tag is absent or its '>' is missing.
func openTagEnd(low, tag string) int {
	from := 0
	for {
		i := strings.Index(low[from:], tag)
		if i < 0 {
			return -1
		}
		i += from
		rest := i + len(tag)
		if rest >= len(low) {
			return -1
		}
		switch low[rest] {
		case '>', ' ', '\t', '\n', '\r', '\f':
			if gt := strings.IndexByte(low[rest:], '>'); gt >= 0 {
				return rest + gt + 1
			}
			return -1
		}
		from = i + 1 // e.g. "<header" — keep scanning
	}
}
