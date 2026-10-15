.PHONY: test build app-build

test:
	npm test

build:
	anchor build

app-build:
	npm --prefix app run build
