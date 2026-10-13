# The film, step by step. Each step reads only what the one before it wrote,
# so after any change re-run from that step: `make data review` after editing
# scenes.js needs nothing else; a changed line of narration needs `make voice`.
PY ?= python3

all: capture voice data review

capture:            ## screenshots + element boxes from the running app
	node capture.mjs
voice:              ## narration: voice, verify, trim, level, align words
	$(PY) voice.py
	$(PY) trim.py
	$(PY) align.py
data:               ## data.js for film.html
	$(PY) build_data.py
review: data        ## timing + stills a second into each line, to look at
	node render.mjs info
	node render.mjs stills $$($(PY) -c "import json;print(' '.join(f\"{s['V']+1:.2f}\" for s in json.load(open('info.json'))['scenes']))" 2>/dev/null)
render: data        ## the master picture (4K60 by default)
	node render.mjs video
film: render        ## sound, then the deliverables and checks
	node render.mjs info
	$(PY) mix.py
	$(PY) finish.py

.PHONY: all capture voice data review render film
