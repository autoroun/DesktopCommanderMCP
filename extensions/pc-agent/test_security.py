"""Security and behavior regression tests for the Windows MCP companion."""
import pathlib, tempfile, unittest, unittest.mock, sys, os
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
import mcp_server as agent
class SecurityTests(unittest.TestCase):
    def test_reject_unlisted_project(self):
        with tempfile.TemporaryDirectory() as root:
            with unittest.mock.patch.object(agent,"cfg",return_value={"project_roots":[root]}):
                with self.assertRaises(PermissionError):
                    agent.permitted(pathlib.Path(root).parent)
                self.assertEqual(agent.permitted(root),pathlib.Path(root).resolve())
    def test_reject_gui_without_permission(self):
        with unittest.mock.patch.object(agent,"cfg",return_value={"enable_gui_actions":False}):
            with self.assertRaises(PermissionError):agent.mouse_click(50,50)
            with self.assertRaises(PermissionError):agent.keyboard_type("test")
    def test_reject_non_select_sql(self):
        with tempfile.TemporaryDirectory() as root:
            p=pathlib.Path(root)/"test.sqlite"
            import sqlite3
            db=sqlite3.connect(p)
            try:db.execute("CREATE TABLE items (value TEXT)");db.commit()
            finally:db.close()
            with unittest.mock.patch.object(agent,"cfg",return_value={"project_roots":[root]}):
                for q in ["DELETE FROM items","SELECT * FROM items; DELETE FROM items","PRAGMA database_list"]:
                    with self.subTest(query=q),self.assertRaises(ValueError):agent.sqlite_select(str(p),q)
                self.assertEqual(agent.sqlite_select(str(p),"SELECT * FROM items"),[])
    @unittest.skipIf(bool(os.environ.get("CI")), "CI runners may not have interactive desktop")
    def test_screenshot_returns_jpeg(self):
        img=agent.take_screenshot(800)
        self.assertTrue(img.data.startswith(bytes.fromhex("ffd8")))
        self.assertGreater(len(img.data),1000)
if __name__=="__main__":unittest.main(verbosity=2)
