# Skill Portability

The Image Annotator skill is designed to be vendor-neutral and portable. It consists of static Markdown files that provide guidance to AI agents on how to use the image annotation tools (CLI and MCP).

## Installation

To install this skill, copy or symlink the `skills/image-annotator/` directory into your agent's skill directory.

### Example Environments

#### Claude Code
Copy the directory to:
```bash
.claude/skills/image-annotator/
```

#### General Agent Environments
Most agents that support custom skills will have a specific directory they watch for Markdown-based skill definitions. Place the `image-annotator/` directory there.

## Activation Entry Point

The `SKILL.md` file serves as the activation entry point. It contains the metadata (name, description, version) that agents use to identify and load the skill.

## Design Principles

- **Static Guidance**: Skills are documentation, not executable code. They guide the agent's behavior and tool selection.
- **Vendor Neutrality**: The skill does not rely on proprietary formats or vendor-locked configuration.
- **Hybrid Support**: The skill covers both CLI and MCP workflows, allowing agents to choose the best tool for the current environment.
- **No Secrets**: Skill files must never contain API keys, tokens, or environment-specific URLs.
