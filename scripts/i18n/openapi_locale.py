#!/usr/bin/env python3
"""Source-bound OpenAPI prose catalog and reconstruction tool."""
import argparse
import copy
import hashlib
import json
import re
from pathlib import Path
import sys

import yaml
from openapi_spec_validator import validate

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    'techstack': 'techstack/reference/api/openapi.yaml',
    'gateway': 'identity/reference/api/openapi.yaml',
}
# These subtrees contain values/code, not OpenAPI documentation objects. Never
# interpret a property named description or summary inside them as prose.
OPAQUE = {'example', 'examples', 'default', 'enum', 'const', 'externalValue'}
# Map keys below these OpenAPI containers are names, even when a name happens
# to equal a keyword or begins with x-.
NAMED_MAPS = {'properties', 'patternProperties', '$defs', 'schemas', 'responses',
              'parameters', 'requestBodies', 'headers', 'securitySchemes',
              'links', 'callbacks', 'pathItems', 'content', 'encoding'}
PRODUCT_TITLES = {'kombify Gateway API', 'kombify-TechStack API'}

class UniqueLoader(yaml.SafeLoader):
    pass

def unique_mapping(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise ValueError(f'duplicate YAML key: {key!r}')
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping
UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)

def unique_json(pairs):
    obj = {}
    for k, v in pairs:
        if k in obj:
            raise ValueError(f'duplicate JSON key: {k}')
        obj[k] = v
    return obj

def reject_yaml_aliases(raw):
    # Shared object identity could let a prose edit mutate a protected subtree.
    for token in yaml.scan(raw, Loader=UniqueLoader):
        if isinstance(token, (yaml.tokens.AnchorToken, yaml.tokens.AliasToken)):
            raise ValueError('YAML anchors and aliases are not permitted')

def preflight_references(node, pointer=''):
    # Check the entire parsed tree, including examples and extensions, before
    # passing it to a validator that may resolve references. A schema base URI
    # could turn an otherwise local reference into an external one.
    if isinstance(node, dict):
        for key, value in node.items():
            p = pointer + '/' + escape(key)
            if key in ('$id', '$schema', '$dynamicRef', '$recursiveRef'):
                raise ValueError(f'unsupported schema resolution keyword: {p}')
            if key == '$ref' and (not isinstance(value, str) or not value.startswith('#/')):
                raise ValueError(f'unsupported external or non-pointer reference: {p}')
            preflight_references(value, p)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            preflight_references(value, pointer + '/' + str(index))

def read_source(name):
    raw = (ROOT / SOURCES[name]).read_bytes()
    reject_yaml_aliases(raw)
    doc = yaml.load(raw, Loader=UniqueLoader)
    preflight_references(doc)
    validate(doc)
    return raw, doc

def escape(key):
    return str(key).replace('~', '~0').replace('/', '~1')

def entries(node, pointer='', parent_key=None):
    if isinstance(node, dict):
        named_map = parent_key in NAMED_MAPS
        for k, v in node.items():
            p = pointer + '/' + escape(k)
            # OAuth scope descriptions are map values rather than named
            # description fields. Reject until the catalog supports them.
            if k == 'scopes' and '/flows/' in pointer and isinstance(v, dict) and v:
                raise ValueError(f'unsupported OAuth scope descriptions: {p}')
            if not named_map:
                if k == 'title' and isinstance(v, str):
                    if p != '/info/title' or v not in PRODUCT_TITLES:
                        raise ValueError(f'unsupported OpenAPI title: {p}')
                    continue  # Exact, unchanged product identity.
                if k in OPAQUE or str(k).startswith('x-'):
                    continue
                if k in ('summary', 'description') and isinstance(v, str):
                    yield p, v
                    continue
            yield from entries(v, p, None if named_map else str(k))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from entries(v, pointer + '/' + str(i), None)

def protected_tokens(value):
    # Preserve marked code, URLs, link destinations, HTML tags and placeholders.
    pattern = r'```[\s\S]*?```|`[^`\n]+`|https?://[^\s<>)]+|(?<=\]\()[^\s)]+|<[^>\n]+>|\{[A-Za-z_][A-Za-z0-9_.-]*\}'
    return sorted(re.findall(pattern, value))

def lookup_key(node, part):
    if isinstance(node, list): return int(part)
    matches = [key for key in node if str(key) == part]
    if len(matches) != 1: raise ValueError(f'ambiguous or missing pointer segment: {part}')
    return matches[0]

def set_pointer(doc, pointer, value):
    parts = [p.replace('~1', '/').replace('~0', '~') for p in pointer[1:].split('/')]
    node = doc
    for part in parts[:-1]:
        node = node[lookup_key(node, part)]
    node[lookup_key(node, parts[-1])] = value

def sha(data): return hashlib.sha256(data).hexdigest()

def build_catalog(name, raw, doc):
    return {'format': 'kombify.openapiprosetranslations/v1', 'source': SOURCES[name],
            'source_sha256': sha(raw), 'entries': [
                {'pointer': p, 'source': v, 'translation': None} for p, v in entries(doc)]}

def outside_repository(path):
    resolved = path.resolve()
    if resolved == ROOT or ROOT in resolved.parents:
        raise ValueError('generated catalog and output paths must be outside the documentation repository')
    return resolved

def run():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('extract', 'reconstruct'):
        p = sub.add_parser(command)
        p.add_argument('name', choices=sorted(SOURCES))
        p.add_argument('catalog', type=Path)
        if command == 'reconstruct': p.add_argument('output', type=Path)
    a = parser.parse_args()
    if a.command == 'extract':
        a.catalog = outside_repository(a.catalog)
    else:
        a.output = outside_repository(a.output)
    raw, doc = read_source(a.name)
    baseline = build_catalog(a.name, raw, doc)
    if a.command == 'extract':
        # Exclusive creation avoids destroying a translator's work.
        with a.catalog.open('x', encoding='utf-8', newline='\n') as f:
            json.dump(baseline, f, ensure_ascii=False, indent=2); f.write('\n')
        print(f'extracted {len(baseline["entries"])} entries; sha256={sha(raw)}')
        return
    catalog = json.loads(a.catalog.read_text(encoding='utf-8'), object_pairs_hook=unique_json)
    if not isinstance(catalog, dict) or set(catalog) != set(baseline):
        raise ValueError('invalid catalog envelope')
    for key in ('format', 'source', 'source_sha256'):
        if catalog[key] != baseline[key]: raise ValueError(f'source/catalog mismatch: {key}')
    supplied = catalog['entries']
    if not isinstance(supplied, list): raise ValueError('entries must be a list')
    indexed = {}
    for item in supplied:
        if not isinstance(item, dict) or set(item) != {'pointer', 'source', 'translation'}:
            raise ValueError('invalid entry fields')
        pointer = item['pointer']
        if not isinstance(pointer, str) or pointer in indexed: raise ValueError(f'duplicate/invalid pointer: {pointer!r}')
        indexed[pointer] = item
    expected = {entry['pointer']: entry for entry in baseline['entries']}
    if indexed.keys() != expected.keys(): raise ValueError('missing or unexpected translation pointer')
    result = copy.deepcopy(doc)
    for pointer, source in expected.items():
        item = indexed[pointer]
        if item['source'] != source['source']: raise ValueError(f'source text mismatch: {pointer}')
        if not isinstance(item['translation'], str) or not item['translation'].strip():
            raise ValueError(f'missing translation: {pointer}')
        if protected_tokens(item['source']) != protected_tokens(item['translation']):
            raise ValueError(f'protected code, link or placeholder changed: {pointer}')
        set_pointer(result, pointer, item['translation'])
    preflight_references(result)
    validate(result)
    encoded = yaml.safe_dump(result, allow_unicode=True, sort_keys=False, width=1000).encode('utf-8')
    reject_yaml_aliases(encoded)
    reread = yaml.load(encoded, Loader=UniqueLoader)
    preflight_references(reread)
    validate(reread)
    # Restore only explicitly translated fields, then require whole-document parity.
    restored = copy.deepcopy(reread)
    for pointer, item in expected.items(): set_pointer(restored, pointer, item['source'])
    if restored != doc: raise ValueError('protected OpenAPI structure changed on reconstruction')
    # Do not overwrite a source or prior deliverable, even if an output is mis-specified.
    with a.output.open('xb') as f: f.write(encoded)
    print(f'validated {len(expected)} translations; source_sha256={sha(raw)} output_sha256={sha(encoded)}')

if __name__ == '__main__':
    try: run()
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
