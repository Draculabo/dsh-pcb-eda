# Huaqiu PCB EDA for DSH

Huaqiu PCB EDA brings Huaqiu electronic-design capabilities into [DeepSeek Harness (DSH)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin), including Huaqiu part search, datasheet analysis, schematic generation, symbol and footprint generation, and datasheet-based ERC.

The plugin connects DSH with Huaqiu's EDA services through **HQ Edge**, providing interactive UI for electronics-design workflows while keeping generated designs and artifacts available to the DSH workspace.

## Features

### 🔐 Huaqiu Account

Connect your Huaqiu account to access Huaqiu electronic-component services from DSH.

* Huaqiu account login
* Account/session status
* Authenticated Huaqiu services
* Secure session handling

### 🔎 PCB Part Search

Search Huaqiu's component library directly from DSH.

Search by:

* Part number
* Manufacturer
* Package
* Component type
* Electrical specifications
* Datasheet information

Part results provide structured component information and can be used directly by subsequent EDA workflows.

### 📄 Datasheet Analysis

Analyze component datasheets and extract structured electrical and mechanical information.

Datasheet information can be used for:

* Component selection
* Symbol generation
* Footprint generation
* Schematic validation
* ERC reasoning

The goal is to keep design decisions grounded in component documentation rather than relying only on model knowledge.

### ◇ Schematic Generation

Generate and modify KiCad schematic designs from natural-language requirements.

For example:

> Design a simple ESP32-C3 fan controller with a USB-C power input, 3.3 V regulator, and PWM-controlled fan.

The generated design can be inspected and further modified within the EDA workflow.

### ◎ Symbol Generation

Generate KiCad schematic symbols from component specifications and datasheets.

The workflow can derive:

* Pin numbers
* Pin names
* Electrical types
* Pin directions
* Power pins
* Hidden/visible pins
* Symbol geometry

Generated symbols are returned as workspace artifacts rather than requiring the model to emit large raw KiCad files into the conversation.

### ▣ Footprint Generation

Generate KiCad PCB footprints from package specifications and datasheets.

The footprint workflow supports an interactive editor for package dimensions, allowing users to review and adjust dimensions before generating the final footprint.

Typical parameters include:

* Package dimensions
* Pad dimensions
* Pad pitch
* Pad count
* Pin-1 marking
* Courtyard
* Silkscreen
* Fabrication outline
* Solder-mask settings

### ✓ Datasheet-Based ERC

Run ERC using both schematic connectivity and component documentation.

The ERC workflow combines:

```text
Schematic
    │
    ├── connectivity
    ├── symbols
    └── electrical properties
             │
             ▼
       Component data
             │
             ├── datasheet
             ├── specifications
             └── package information
             │
             ▼
       Structured assertions
             │
             ▼
       ERC findings
```

Each finding can provide:

* Severity
* Affected schematic objects
* Net/connectivity information
* Datasheet evidence
* Reasoning
* Suggested resolution

This makes ERC conclusions traceable to structured design and component evidence rather than depending solely on the model's prior knowledge.

## Example Workflows

### Find a component

```text
Find a 3.3 V LDO capable of at least 500 mA,
preferably in SOT-23, and show me suitable Huaqiu parts.
```

The plugin searches the Huaqiu component library and presents structured part candidates.

### Generate a footprint

```text
Generate the footprint for this component from its datasheet.
```

The plugin extracts package information and opens an interactive footprint-generation workflow for review before producing the artifact.

### Generate a symbol

```text
Generate a KiCad symbol for this component.
```

The plugin derives the symbol from the component specification and datasheet and returns it as a workspace artifact.

### Generate a schematic

```text
Design a simple ESP32-C3 fan controller.
```

DSH can combine component search, datasheet information, symbol/footprint generation, and schematic generation into a single workflow.

### Check the design

```text
Run ERC and check whether the schematic is consistent
with the component datasheets.
```

The plugin analyzes the design and produces structured, evidence-backed ERC findings.

## Architecture

```text
┌───────────────────────────────────────────┐
│                DeepSeek Harness            │
│                    (DSH)                  │
│                                           │
│  Agent · Tools · HIT · Workspace          │
└─────────────────────┬─────────────────────┘
                      │
                      │ DSH Plugin
                      ▼
┌───────────────────────────────────────────┐
│           @huaqiu/dsh-pcb-eda             │
│                                           │
│  Part Search · Datasheet · Schematic      │
│  Symbol · Footprint · ERC                 │
└─────────────────────┬─────────────────────┘
                      │
                      │ HQ Edge
                      ▼
┌───────────────────────────────────────────┐
│                  HQ Edge                  │
│                                           │
│  Huaqiu APIs · EDA Services · Artifacts   │
│  ECAD Processing · Datasheet Services     │
└───────────────────────────────────────────┘
```

The DSH plugin provides the DSH-facing tools and interactive UI. HQ Edge provides the service and EDA integration layer behind the plugin.

This separation allows the DSH plugin to remain lightweight while sharing the same EDA infrastructure with other Huaqiu applications.

## Artifacts

EDA outputs are represented as workspace artifacts rather than being unnecessarily embedded as large code blocks in the conversation.

Supported artifact types include:

* KiCad schematics
* KiCad symbols
* KiCad footprints
* PCB designs
* Datasheet-derived component data
* ERC reports and findings

Generated artifacts can be reused by subsequent DSH operations.

## Installation

### npm

```bash
npm install @huaqiu/dsh-pcb-eda
```

### DSH

Install the plugin through DSH's plugin system:

```bash
dsh plugin --profile web add @huaqiu/dsh-pcb-eda
```

Or install it directly from GitHub:

```bash
dsh plugin --profile web add github:Huaqiu-Electronics/dsh-pcb-eda
```

> Installation commands may vary with the DSH version and plugin profile in use.

## Development

Clone the repository:

```bash
git clone https://github.com/Huaqiu-Electronics/dsh-pcb-eda.git
cd dsh-pcb-eda
```

Install dependencies:

```bash
pnpm install
```

Build:

```bash
pnpm build
```

## Relationship with HQ Edge

`dsh-pcb-eda` is the **DSH integration layer** for Huaqiu EDA capabilities.

HQ Edge remains the backend/runtime integration layer and is intentionally kept separate from the DSH plugin.

```text
Huaqiu EDA
    │
    ├── DSH
    │    └── @huaqiu/dsh-pcb-eda
    │
    └── HQ Edge
         ├── EDA services
         ├── Huaqiu services
         ├── artifact services
         └── ECAD integration
```

This repository should therefore contain DSH-specific integration, UI, HITs, tools, and client-side integration rather than duplicating HQ Edge functionality.

## Contributing

Contributions are welcome.

Before submitting a change:

1. Install dependencies with `pnpm install`.
2. Run the relevant tests.
3. Run `pnpm build`.
4. Verify the plugin against a supported DSH version.
5. Keep DSH-specific integration in this repository and shared EDA functionality in the appropriate Huaqiu/HQ Edge project.

## License

See [LICENSE](LICENSE) for license information.
