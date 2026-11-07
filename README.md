# Lobnan Print Local — Development Workspace

This repository is for the Lobnan Print local-first accounting application.

## Status
**Development / testing only.** The PostgreSQL synchronization prototype has not passed production acceptance tests. Do not record real invoices or rely on it for financial reporting yet.

## Data safety
Never commit customer records, invoices, receipts, device databases, PostgreSQL data directories, backups, API tokens, passwords, or .env files.

## Source bundle
The full project source currently exists as a separate reviewed ZIP package. Publishing the source must follow a privacy review because **this repository is public**.

## Planned architecture
- Main PC: PostgreSQL and local Node.js API
- Other devices: durable local queue while offline
- Centralized authorization of invoice numbers and accounting postings
- Reconciliation and two-device acceptance tests before release

To publish the local ZIP without replacing this branch, use the reviewed `scripts/publish-to-lobnanprintlocal.ps1` script included in the source package, after examining its content and installing Git on your own computer.
