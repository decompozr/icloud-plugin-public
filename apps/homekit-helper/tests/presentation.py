#!/usr/bin/env python3
"""Exercise the exact native presentation policy without launching UIKit/HomeKit."""
from pathlib import Path
import subprocess,tempfile,os
source=Path('apps/homekit-helper/native/HomeKitHelper/Presentation.swift').read_text()
policy=source.split('// BEGIN PRESENTATION SUPPORT',1)[1].split('// END PRESENTATION SUPPORT',1)[0].split('\n',1)[1]
with tempfile.TemporaryDirectory(prefix='homekit-presentation-',dir='/tmp') as root:
 p=Path(root)/'test.swift'
 p.write_text('import Foundation\n'+policy+'''\nprecondition(!HelperPresentation.showsWindow([]))
precondition(!HelperPresentation.showsWindow(["helper","--read-only"]))
precondition(!HelperPresentation.showsWindow(["helper","--lifecycle-directory","/private/fixture"]))
precondition(!HelperPresentation.showsWindow(["helper","--show-window=false"]))
precondition(HelperPresentation.showsWindow(["helper","--read-only","--show-window"]))
print("5 native presentation checks passed")
''')
 subprocess.run(['xcrun','swift',str(p)],check=True,env=dict(os.environ,DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer'))
