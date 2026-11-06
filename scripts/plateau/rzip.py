import io, sys, zipfile, urllib.request, os

class HttpFile(io.RawIOBase):
    def __init__(self, url):
        self.url, self.pos, self.fetched = url, 0, 0
        req = urllib.request.Request(url, method="HEAD")
        self.size = int(urllib.request.urlopen(req).headers["Content-Length"])
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = {0: off, 1: self.pos + off, 2: self.size + off}[whence]
        return self.pos
    def readinto(self, b):
        n = min(len(b), self.size - self.pos)
        if n <= 0: return 0
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos+n-1}"})
        data = urllib.request.urlopen(req).read()
        b[:len(data)] = data
        self.pos += len(data); self.fetched += len(data)
        return len(data)

url, mode = sys.argv[1], sys.argv[2]
f = io.BufferedReader(HttpFile(url), buffer_size=1 << 20)
z = zipfile.ZipFile(f)
if mode == "list":
    pat = sys.argv[3]
    for i in z.infolist():
        if pat in i.filename:
            print(i.file_size, i.compress_size, i.filename)
elif mode == "get":
    outdir = sys.argv[3]
    for name in sys.argv[4:]:
        data = z.read(name)
        p = os.path.join(outdir, os.path.basename(name))
        open(p, "wb").write(data)
        print("wrote", p, len(data))
print("bytes fetched", f.raw.fetched, file=sys.stderr)
