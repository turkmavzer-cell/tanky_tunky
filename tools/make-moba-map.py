"""Builds maps/moba_1.json (round 08 mission map) from the owner's reference picture (LoL map for Warcraft 3):
3 lanes (top, diagonal mid, bottom), a diagonal river with two deep lakes, a jungle of C-shaped wood clumps,
bases in the bottom-left / top-right corners, point-symmetric so it can serve multiplayer later.
Usage: python3 tools/make-moba-map.py  (seeded, deterministic; also writes a preview PNG to /tmp)."""
import json, math, random
from collections import deque
N=96; R=random.Random(8)
g=[['T']*N for _ in range(N)]
def put(x,y,c):
    if 0<=x<N and 0<=y<N: g[y][x]=c
def disc(cx,cy,r,c,only=None):
    for y in range(int(cy-r)-1,int(cy+r)+2):
        for x in range(int(cx-r)-1,int(cx+r)+2):
            if 0<=x<N and 0<=y<N and (x+.5-cx)**2+(y+.5-cy)**2<=r*r and (only is None or g[y][x] in only): g[y][x]=c
def poly(pts,r,c,only=None):
    for (ax,ay),(bx,by) in zip(pts,pts[1:]):
        L=math.hypot(bx-ax,by-ay); n=int(L*2)+1
        for k in range(n+1):
            t=k/n; disc(ax+(bx-ax)*t,ay+(by-ay)*t,r,c,only)
def segdist(px,py,pts):
    best=1e9
    for (ax,ay),(bx,by) in zip(pts,pts[1:]):
        dx,dy=bx-ax,by-ay; L2=dx*dx+dy*dy
        t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/L2)); best=min(best,math.hypot(px-ax-dx*t,py-ay-dy*t))
    return best
# play area: rounded square inside a 4-tile wood rim
for y in range(N):
    for x in range(N):
        ix=min(x,N-1-x); iy=min(y,N-1-y)
        if ix>=4 and iy>=4:
            # round the top-left and bottom-right corners (as in the reference), keep base corners square
            cxr=None
            if (x<18 and y<18): cxr=(18,18)
            if (x>N-19 and y>N-19): cxr=(N-18,N-18)
            if cxr and math.hypot(x+.5-cxr[0],y+.5-cxr[1])>14: continue
            g[y][x]='.'
B0=(14,81); B1=(81,14)
TOP=[B0,(8.5,68),(8.5,22),(16,10),(30,8.5),(73,8.5),B1]
BOT=[(95-x,95-y) for x,y in TOP]
MID=[B0,(28,69),(47.5,47.5),(67,26),B1]
RIVER=[(14,14),(26,24),(38,40),(47.5,47.5),(57,55),(69,71),(81,81)]
lanes=[TOP,BOT,MID]
# jungle clumps: C-shaped and blob woods (one half, mirrored later)
def near_any(x,y):
    return min(segdist(x,y,L) for L in lanes)<5.5 or segdist(x,y,RIVER)<5 or math.hypot(x-B0[0],y-B0[1])<14 or math.hypot(x-B1[0],y-B1[1])<14
placed=0; tries=0; centers=[]
while placed<44 and tries<20000:
    tries+=1
    cx=R.uniform(6,90); cy=R.uniform(6,90)
    if cx+cy>95 or g[int(cy)][int(cx)]!='.' or near_any(cx,cy): continue
    r=R.uniform(2.6,4.0); th=R.uniform(1.9,2.6); a0=R.uniform(0,2*math.pi); gap=R.uniform(1.6,2.6)
    if any(math.hypot(cx-a,cy-b)<r+rb+1.6 for a,b,rb in centers): continue
    blob=R.random()<0.25
    ok=True
    cells=[]
    for y in range(int(cy-r-th)-1,int(cy+r+th)+2):
        for x in range(int(cx-r-th)-1,int(cx+r+th)+2):
            d=math.hypot(x+.5-cx,y+.5-cy)
            if blob: inside=d<=r*0.8
            else:
                ang=(math.atan2(y+.5-cy,x+.5-cx)-a0)%(2*math.pi)
                inside=abs(d-r)<=th/2 and ang>gap
            if inside: cells.append((x,y))
    if any(near_any(x,y) for x,y in cells): continue
    for x,y in cells:
        if 0<=x<N and 0<=y<N and g[y][x]=='.': g[y][x]='T'
    placed+=1; centers.append((cx,cy,r)); centers.append((95-cx,95-cy,r))
# lane walls: wood lines beside the lanes with openings, so the jungle is entered through gaps
def lane_wall(pts, period=18, opening=7):
    s=0
    for (ax,ay),(bx,by) in zip(pts,pts[1:]):
        L=math.hypot(bx-ax,by-ay); n=int(L*2)+1
        for k in range(n+1):
            t=k/n; px,py=ax+(bx-ax)*t,ay+(by-ay)*t; s_here=s+L*t
            if math.hypot(px-B0[0],py-B0[1])<16 or math.hypot(px-B1[0],py-B1[1])<16: continue
            if s_here%period<opening: continue
            nx,ny=-(by-ay)/L,(bx-ax)/L
            for side in (-1,1):
                for off in (4.6,):
                    x,y=int(px+nx*off*side),int(py+ny*off*side)
                    if 0<=x<N and 0<=y<N and g[y][x]=='.' and segdist(x+.5,y+.5,RIVER)>4: g[y][x]='T'
        s+=L
for L in lanes: lane_wall(L)
# river: shallow band, two deep lakes with shallow shores
poly(RIVER,2.6,'~')
for c in ((29,29),(66,66)):
    disc(c[0],c[1],7.5,'~'); disc(c[0],c[1],4.8,'w')
# lanes on top (stone paths), crossing the river shallow
for L in lanes: poly(L,2.4,'p',only=set('.T~fw'))
# bases
disc(B0[0],B0[1],9,'d'); disc(B1[0],B1[1],9,'d')
# bushes (passable cover) on the river banks
for k in range(7):
    t=R.uniform(0.1,0.45); i=int(t*(len(RIVER)-1))
    (ax,ay),(bx,by)=RIVER[i],RIVER[i+1]; f=R.random()
    px,py=ax+(bx-ax)*f,ay+(by-ay)*f; side=R.choice((-1,1))
    disc(px+side*4.2,py-side*4.2,1.6,'f',only=set('.'))
# mirror: point symmetry (x,y) -> (95-x,95-y), the half x+y<95 is the master
for y in range(N):
    for x in range(N):
        if x+y>95 or (x+y==95 and x>47): g[y][x]=g[95-y][95-x]
# flood fill from the player base: sealed pockets become wood
passable=set('.pd~f=')
seen={B0}; q=deque([B0])
while q:
    x,y=q.popleft()
    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
        n=(x+dx,y+dy)
        if 0<=n[0]<N and 0<=n[1]<N and n not in seen and g[n[1]][n[0]] in passable: seen.add(n); q.append(n)
sealed=0
for y in range(N):
    for x in range(N):
        if g[y][x] in passable and (x,y) not in seen: g[y][x]='T'; sealed+=1
assert B1 in seen
g[B0[1]][B0[0]]='S'; g[B1[1]][B1[0]]='H'
rows=[''.join(r) for r in g]
openf=sum(c in passable or c in 'SH' for r in rows for c in r)/N/N
print('sealed',sealed,'open',round(openf,2),'clumps',placed)
json.dump({"name":"moba_1","unit":1,"size":96,"fill":"T","layout":rows},open('maps/moba_1.json','w'))
# preview image
from PIL import Image
col={'T':(30,70,30),'#':(120,120,120),'.':(120,170,80),'p':(190,185,170),'d':(160,130,90),'~':(80,140,190),'w':(40,60,150),'f':(60,120,50),'S':(0,0,255),'H':(255,0,0),'=':(140,100,60)}
im=Image.new('RGB',(N,N))
for y in range(N):
    for x in range(N): im.putpixel((x,y),col[g[y][x]])
im.resize((N*6,N*6),Image.NEAREST).save('/tmp/moba-preview.png')
