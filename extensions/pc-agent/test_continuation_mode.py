"""Continuation mode expiry and stop behavior."""
import datetime,pathlib,tempfile,unittest
import continuation,continuation_mode
class ModeTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory()
  self.old=continuation.DB
  continuation.DB=pathlib.Path(self.tmp.name)/"db.sqlite3"
  self.id=continuation.start("Develop Remote Desktop Commander","Inspect files")["task_id"]
 def tearDown(self):
  continuation.DB=self.old
  self.tmp.cleanup()
 def test_continuous_then_stop(self):
  self.assertEqual(continuation_mode.set_mode(self.id,"continuous")["mode"],"continuous")
  continuation_mode.set_mode(self.id,"stopped")
  with self.assertRaises(ValueError):continuation.advance(self.id,"Inspect files","done","Next")
 def test_timed(self):
  value=continuation_mode.set_mode(self.id,"timed",minutes=5)
  self.assertEqual(value["mode"],"timed")
  self.assertIsNotNone(value["deadline"])
 def test_expiry(self):
  continuation_mode.set_mode(self.id,"timed",minutes=5)
  with continuation.connection() as con:
   con.execute("UPDATE continuation_modes SET deadline=? WHERE task_id=?",("2000-01-01T00:00:00+00:00",self.id))
  self.assertEqual(continuation_mode.get_mode(self.id)["mode"],"stopped")
  with self.assertRaises(ValueError):continuation.update(self.id,"result","next")
 def test_invalid_duration(self):
  with self.assertRaises(ValueError):continuation_mode.set_mode(self.id,"timed",minutes=0)
 def test_timezone_required(self):
  with self.assertRaises(ValueError):continuation_mode.set_mode(self.id,"timed",until_utc="2026-11-09T12:00:00")
if __name__=="__main__":unittest.main(verbosity=2)
