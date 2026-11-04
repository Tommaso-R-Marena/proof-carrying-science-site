# Retained development failures

These are automated development logs, not final-release passes, human observations or measured language-model vulnerabilities.

- `coverage2-development.log`: the first expanded coverage run had 119 passes and two 5-second timeouts. The long idle replay fixture was replaced with a shorter, actually completed loss driven by valid inputs. Assertions and the 1,200-plan campaign remained, and no timeout threshold was increased. The final suite passes all 121 tests.
- `portable1-development.log` and `portable2-development.log`: early packaging attempts did not start. The builder was corrected to retain module execution semantics and to insert dependency code after HTML edits. A dependency string containing a body-closing tag had been altered by footer insertion, causing the CSP's script hash to disagree with the actual inline script. The final builder checks that hash before writing a file.
- `portable3-development.log`: Firefox reported Zod's caught optional eval capability probe under CSP. Shared schemas now use the library's supported interpreted mode. No eval permission, inline-script wildcard, validator relaxation or console-error filtering was added to make this pass.

The final offline tests open the actual file without a network in both browsers, verify its exported case in Node and require deliberately changed code to be blocked. These results are bounded implementation evidence, not an immutable trust-root claim. Earlier v0.2/v0.3 game counterexamples remain in their original directories.
