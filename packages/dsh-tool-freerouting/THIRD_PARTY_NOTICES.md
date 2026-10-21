# Third-party notices

## Plugin code

This package declares `UNLICENSED` and grants no license to its first-party TypeScript and Python code. The repository-root MIT license is excluded from this package. Third-party components retain their own licenses.

## FreeRouting engine

The plugin package does **not** distribute the FreeRouting engine. The KiCad Windows installer ships it as `bin\freerouting.exe`, and users may point `DSH_FREEROUTING_EXE` at another build. That engine is based on [FreeRouting](https://github.com/freerouting/freerouting) 2.5.0, revision `b647a2f824cfbc54bc4dcaee71b03b7cd945eb76`, with local changes identified by `dsh-freerouting-2.5.0-1`; the engine and its modifications retain GPL-3.0. Its license is provided for reference as `bundled/freerouting.LICENSE`.

Corresponding engine source and build instructions are available in the [project source repository](https://github.com/Huaqiu-Electronics/dsh-pcb-eda/tree/main/packages/dsh-tool-freerouting/engine). That directory contains the complete pinned upstream source archive, modified Java files, source lock, build script and regression tests. Distributors of the engine binary must retain the matching source revision and provide access to it with the binary release. Building requires Python 3.11+, a full JDK 25 and Gradle/Maven network access; installation and routing do not compile Java.

## Runtime and library dependencies

- Eclipse Temurin Java 25 retains its upstream terms. It is bundled inside the KiCad-provided engine, whose legal notices travel with that installer; this plugin package contains no Java runtime.
- Bundled Python libraries retain license files and distribution metadata under `python/vendor/`. Versions, wheel origins and hashes are recorded in `python/dependencies.lock.json`.
- Node dependencies retain their own licenses in their installed packages. Dependencies are declared in `package.json`.

Internal design and acceptance documents are excluded from the plugin release.
