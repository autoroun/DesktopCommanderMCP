"""Offline tests for OpenAI coding worker without API credentials or network calls."""
import pathlib, tempfile, unittest, unittest.mock
import openai_coding_worker as worker
class WorkerTests(unittest.TestCase):
 def test_scope_blocks_parent(self):
  with self.assertRaises(ValueError):worker.safe("../../outside.py")
 def test_scope_blocks_config(self):
  with self.assertRaises(ValueError):worker.safe("config.json")
 def test_scope_blocks_binary(self):
  with self.assertRaises(ValueError):worker.safe("malware.exe")
 def test_missing_api_key_blocks(self):
  with unittest.mock.patch.dict("os.environ",{},clear=True):
   self.assertEqual(worker.cycle("gpt-6",1)["state"],"blocked")
 def test_local_read_only(self):
  files=worker.dispatch("list_files",{})
  self.assertIn("mcp_server.py",files)
  self.assertIn("FastMCP",worker.dispatch("read_file",{"path":"mcp_server.py"}))
if __name__=="__main__":unittest.main(verbosity=2)
