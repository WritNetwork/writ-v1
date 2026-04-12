.PHONY: build check test lint format clean deploy-devnet sdk-build sdk-test

build:
	cargo check --workspace

test:
	anchor test

lint:
	cargo fmt --all -- --check
	cargo clippy --workspace -- -W warnings
	cd sdk && npx tsc --noEmit

format:
	cargo fmt --all
	cd sdk && npx prettier --write "src/**/*.ts"

clean:
	cargo clean
	rm -rf sdk/dist
	rm -rf .anchor
	rm -rf test-ledger

deploy-devnet:
	anchor deploy --provider.cluster devnet

sdk-build:
	cd sdk && npm run build

sdk-test:
	cd sdk && npm test

check:
	cargo check --workspace
	cd sdk && npx tsc --noEmit
