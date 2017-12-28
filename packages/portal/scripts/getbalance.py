#!/usr/bin/python
import commands
import sys
import json
import os
import time
import datetime

datapath = "balance.json"
if len(sys.argv) > 1:
	datapath = sys.argv[1]

data = []
if os.path.exists(datapath):
	f = open(datapath)
	data = json.loads(f.read())
	f.close()

while True:
	t = int(time.time())
	try:
		b = json.loads(commands.getoutput('koto-cli z_gettotalbalance'))
	except:
		pass;
	b["time"] = t
	b["transparent"] = float(b["transparent"])
	b["private"] = float(b["private"])
	b["total"] = float(b["total"])
	data.append(b)

	if data[0]["time"] < t - 3600*4:
		data = data[1:]

	f = open(datapath, "w")
	f.write(json.dumps(data))
	f.close()

	dt = datetime.datetime.fromtimestamp(time.time())
	dtstr = dt.strftime('%Y-%m-%d %H:%M:%S')
	print "%s: t=%d, p=%d" % (dtstr, b["transparent"], b["private"])
	sys.stdout.flush()

	while int(time.time()) < t + 30:
		time.sleep(1)

