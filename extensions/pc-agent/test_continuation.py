"""Regression tests for durable continuation checkpoints."""
import tempfile, pathlib, unittest
import continuation
class ContinuationTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory()
  self.previous=continuation.DB
  continuation.DB=pathlib.Path(self.tmp.name)/"tasks.db"
 def tearDown(self):
  continuation.DB=self.previous
  self.tmp.cleanup()
 def test_checkpoint_recovery_and_stop(self):
  task=continuation.start("Improve Remote Desktop Commander","Inspect source")
  i=task["task_id"]
  continuation.update(i,"Reviewed files","Run tests")
  self.assertEqual(continuation.status(i)[0]["next_step"],"Run tests")
  self.assertTrue(continuation.stop(i)["stopped"])
  with self.assertRaises(ValueError):continuation.update(i,"Oops","Continue")
 def test_empty_goal_rejected(self):
  with self.assertRaises(ValueError):continuation.start(" ","Next")
 def test_list(self):
  continuation.start("One","A")
  continuation.start("Two","B")
  self.assertEqual(len(continuation.status()),2)
if __name__=="__main__":unittest.main(verbosity=2)
