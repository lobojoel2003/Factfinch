# Versioning and releases

## Version numbers

- **Library and demo** follow [Semantic Versioning](https://semver.org). All packages in the monorepo share one version, set with `npm run version:set -- <version>`.
  - Before 1.0.0, minor versions (`0.x.0`) may change the API; patch versions (`0.1.x`) only fix bugs.
  - Pre-releases use a suffix: `1.0.0-rc.1`. They are marked as pre-releases on GitHub and published to npm under the `next` tag.
- **Rules files** have their own `version` (`2025.1.0` = tax year 2025, revision 1, fix 0), so rule corrections are tracked separately from engine changes.
- **Build numbers** identify a specific CI build. The GitHub Actions run number and commit are stamped into every build by `scripts/stamp-build.mjs`:
  - CLI: `npx factfinch --version` → `0.1.0+build.42 (1a2b3c4d5e6f)`
  - Library: `import { BUILD_INFO } from "factfinch"`
  - Demo: shown in the footer
  - Local builds say `build dev`.

## Cutting a release

1. Make sure `main` is green.
2. Set the version and update the lockfile:
   ```bash
   npm run version:set -- 0.2.0
   npm install
   ```
3. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [0.2.0] - YYYY-MM-DD`, add a fresh empty `Unreleased` section, and update the compare links at the bottom.
4. Commit and tag:
   ```bash
   git commit -am "Release v0.2.0"
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin main v0.2.0
   ```
5. The [Release workflow](../.github/workflows/release.yml) then:
   - checks the tag matches `packages/factfinch/package.json`,
   - runs the full `npm run ci`,
   - builds `factfinch-X.Y.Z.tgz`, the demo zip, the rules files and `SHA256SUMS.txt`,
   - creates the GitHub release with notes taken from the matching `CHANGELOG.md` section,
   - publishes to npm if the repository has an `NPM_TOKEN` secret.

**Without pushing a tag:** run **Actions → Release → Run workflow** on `main` and enter the tag (for example `v0.2.0`). The workflow runs the same checks and creates the tag on that commit. Entering an existing tag re-runs its release.

## Demo deployment

Every push to `main` deploys the demo to GitHub Pages via [pages.yml](../.github/workflows/pages.yml). The first time, enable Pages under **Settings → Pages → Source: GitHub Actions** if the workflow can't enable it on its own.
