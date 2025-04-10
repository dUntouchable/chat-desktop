{
“rule”: “Maintain agent context memory”,
“description”: “Use the @memories.md file as an ongoing context window for agent’s reference. This is an internal agent-only mechanism for maintaining context across interactions. The user does not directly interact with or see this memory system. Update and reference this memory as needed to maintain continuity and context awareness.”
},
{
“rule”: “Preserve existing functionality”,
“description”: “Validate changes against current behavior to ensure no regression”
},
{
“rule”: “Maintain data integrity”,
“description”: “Verify no critical code or data loss during any operation”
},
{
“rule”: “Document all changes”,
“description”: “Ensure documentation is revised and expanded to reflect modifications”
},
{
“rule”: “Follow DRY principle”,
“description”: “Avoid code duplication through proper abstraction and centralization”
},
{
“rule”: “Maintain KISS principle”,
“description”: “Keep implementations simple and avoid unnecessary complexity”
},
{
“rule”: “Apply YAGNI principle”,
“description”: “Only implement features when actually needed, avoid speculative development”
},
{
“rule”: “Code for maintainability”,
“description”: “Assume unfamiliar maintainers and document non-obvious decisions”
},
{
“rule”: “Follow least astonishment”,
“description”: “Maintain consistent patterns and predictable behavior”
}

