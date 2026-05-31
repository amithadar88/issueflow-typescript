# AI Usage - Instructions & Approach

## Tools Used

### Claude Code (VS Code) — Implementation
Used for all code generation, file creation, testing, and bug fixing.
All prompts are documented in `prompts.md`.

### Claude (browser at claude.ai) — Planning & Guidance
Used throughout the project for:
- Understanding and breaking down the requirements
- Planning the project architecture and module structure
- Deciding on NestJS patterns (guards, decorators, interceptors)
- Debugging guidance when things went wrong
- Reviewing requirements against implementation
- Code review and edge case identification
- Crafting precise prompts to send to Claude Code based on requirements and bugs found

This conversation served as a "senior developer" guiding the implementation process. The actual code was generated and applied via Claude Code.

## Model
Claude Sonnet 4.6 (in both)

## Approach
1. Read requirements carefully and planned module structure
2. Built modules one by one (Users → Auth → Projects → Tickets → Comments → Extended features)
3. Tested each module manually with Postman
4. Fixed bugs found during testing
5. Added edge case tests
6. Verified all requirements against the spec