FROM rust:1.78-slim-bookworm AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Cargo.toml Cargo.lock* rust-toolchain.toml ./
COPY programs/hand-registry/Cargo.toml programs/hand-registry/
COPY programs/delegation/Cargo.toml programs/delegation/
COPY programs/reputation/Cargo.toml programs/reputation/
COPY programs/hand-gate/Cargo.toml programs/hand-gate/
COPY cli/Cargo.toml cli/

RUN mkdir -p programs/hand-registry/src programs/delegation/src \
    programs/reputation/src programs/hand-gate/src cli/src && \
    echo "fn main() {}" > cli/src/main.rs && \
    touch programs/hand-registry/src/lib.rs programs/delegation/src/lib.rs \
    programs/reputation/src/lib.rs programs/hand-gate/src/lib.rs && \
    cargo build --release -p hand-cli || true

COPY programs programs
COPY cli cli

RUN cargo build --release -p hand-cli

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -r -u 1001 -m handuser

COPY --from=builder /app/target/release/hand /usr/local/bin/hand

USER handuser
ENTRYPOINT ["hand"]
