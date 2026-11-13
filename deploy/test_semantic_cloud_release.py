"""Run the publisher's pure recovery gate without reading any production configuration."""
import ast
import hashlib
import json
from pathlib import Path


def gate():
    source=ast.parse(Path(__file__).with_name('semantic_cloud_release.py').read_text(encoding='utf-8'))
    names={'sha','snapshot_files','compatible_recovery_safe'}
    module=ast.Module(body=[node for node in source.body if isinstance(node,ast.FunctionDef) and node.name in names],type_ignores=[])
    namespace={'hashlib':hashlib,'json':json}
    exec(compile(module,'frozen-recovery-gate','exec'),namespace)  # noqa: S102 -- Only three fixed functions from our reviewed publisher.
    return namespace['compatible_recovery_safe']


def test_new_semantic_conversations_and_receipts_survive_code_rollback_without_restoring_old_data(tmp_path):
    sessions=tmp_path/'members/synthetic/sessions';sessions.mkdir(parents=True)
    file=sessions/'case.json'
    file.write_text(json.dumps({'status':'idle','systemId':'ecommerce-demo','messages':[
        {'role':'tool','semanticReceipt':{'query_id':'synthetic-known-query','total':{'raw':450100,'unit':'fen'}}}],
        'requests':{'original-request':{'acceptedAt':1,'hash':'a'*64}}}))
    before=file.read_bytes()
    assert gate()(tmp_path) is True
    assert file.read_bytes()==before
    for invalid in [{'status':'running'}, {'status':'idle','administrationBinding':{'contractVersion':'unknown'}}]:
        file.write_text(json.dumps(invalid))
        assert gate()(tmp_path) is False
    file.write_text('malformed')
    assert gate()(tmp_path) is False
