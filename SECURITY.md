# Security policy

## Supported status

DASIG is a hackathon prototype, not a production navigation or safety
system. The current `0.1.x` code is maintained on a best-effort basis.

## Dependency note

The prototype is pinned to React Native 0.77 so the demonstrated Android build
remains reproducible. As of the initial public release, `npm audit` reports
non-critical transitive advisories in the React Native, Metro, CLI and Jest
tooling chains. npm's automatic forced remediation requires major framework
and build-tool upgrades, so those upgrades should be evaluated and tested as a
separate production-hardening change instead of being applied blindly.

Do not expose the Metro development server to an untrusted network. A public
production release should upgrade the framework and toolchain, use a private
release-signing key, review Android network security settings, and repeat the
offline/privacy test suite on physical devices.

## Reporting a vulnerability

Please use GitHub's private vulnerability-reporting feature for this
repository. Do not include a rider's location, spoken transcript, signing key,
access token or other sensitive data in a public issue.
