"""Small changes to FastAPI's OpenAPI document, so code generators (the iOS
app's swift-openapi-generator) make plain optional fields.

Pydantic describes `x: T | None` as `anyOf: [T, {type: null}]`, and lists it
as required when it has no default. Generators turn that into wrapper types.
Here it becomes just `T`, left out of `required`: the field may be missing or
null, and Swift sees an ordinary optional. The API's JSON doesn't change.
"""

from typing import Any

NULL = {"type": "null"}


def _without_null(schema: Any) -> dict[str, Any] | None:
    """`{anyOf: [X, null], …}` → X (with the rest of the keys), or None if it isn't that."""
    if not isinstance(schema, dict):
        return None
    any_of = schema.get("anyOf")
    if not (isinstance(any_of, list) and len(any_of) == 2 and NULL in any_of):
        return None
    other = next(s for s in any_of if s != NULL)
    rest = {k: v for k, v in schema.items() if k != "anyOf"}
    if "$ref" in other:  # next to a $ref, only a description is worth keeping
        return {**other, **({"description": rest["description"]} if "description" in rest else {})}
    return {**other, **rest}


def _walk(node: Any) -> None:
    if isinstance(node, list):
        for item in node:
            _walk(item)
        return
    if not isinstance(node, dict):
        return
    properties = node.get("properties")
    if isinstance(properties, dict):
        for name, prop in list(properties.items()):
            plain = _without_null(prop)
            if plain is not None:
                properties[name] = plain
                if name in node.get("required", []):
                    node["required"].remove(name)
        if "required" in node and not node["required"]:
            del node["required"]
    if "in" in node and "schema" in node:  # a query or path parameter
        plain = _without_null(node["schema"])
        if plain is not None:
            node["schema"] = plain
    for value in node.values():
        _walk(value)


def simplify_optionals(spec: dict[str, Any]) -> dict[str, Any]:
    _walk(spec)
    return spec
