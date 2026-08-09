from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file
from datetime import datetime
import csv, io, sqlite3, os, json, math

app = Flask(__name__)
DB = os.path.join(os.path.dirname(__file__), "order_alert.db")

# -----------------------------
# COSYS integration boundary
# -----------------------------
class CosysConnector:
    """Prototype adapter. Replace these methods with the real COSYS API/WebService."""
    def get_orders(self):
        return db_all("SELECT * FROM orders ORDER BY created_at DESC")
    def get_order_lines(self, order_id):
        return db_all("SELECT * FROM order_lines WHERE order_id=? ORDER BY id", (order_id,))
    def get_picking_lines(self, order_id):
        return db_all("SELECT * FROM order_lines WHERE order_id=? ORDER BY id", (order_id,))
    def mark_alert_checked(self, order_id):
        pass

cosys = CosysConnector()

def conn():
    c=sqlite3.connect(DB)
    c.row_factory=sqlite3.Row
    return c

def db_all(sql, params=()):
    c=conn(); rows=c.execute(sql,params).fetchall(); c.close(); return rows

def db_one(sql, params=()):
    c=conn(); row=c.execute(sql,params).fetchone(); c.close(); return row

def db_exec(sql, params=()):
    c=conn(); cur=c.execute(sql,params); c.commit(); last=cur.lastrowid; c.close(); return last

def now():
    return datetime.now().isoformat(timespec="seconds")

def init_db():
    c=conn()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      sku TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL,
      critical INTEGER DEFAULT 0, threshold REAL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY, external_id TEXT UNIQUE, customer TEXT,
      agent TEXT, status TEXT, created_at TEXT, picking_completed_at TEXT,
      alert_sent INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS order_lines (
      id INTEGER PRIMARY KEY, order_id INTEGER, sku TEXT, product_name TEXT,
      ordered REAL, picked REAL, unit TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY, order_id INTEGER, severity TEXT,
      title TEXT, message TEXT, created_at TEXT,
      acknowledged_at TEXT, verification_requested_at TEXT,
      UNIQUE(order_id)
    );
    CREATE TABLE IF NOT EXISTS verifications (
      id INTEGER PRIMARY KEY, alert_id INTEGER, reason TEXT,
      note TEXT, created_at TEXT, resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, order_id INTEGER, event TEXT,
      actor TEXT, details TEXT, created_at TEXT
    );
    """)
    defaults={"alert_threshold":"80","critical_threshold":"50","zero_alert":"1"}
    for k,v in defaults.items():
        c.execute("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)",(k,v))
    c.commit(); c.close()

def seed():
    if db_one("SELECT COUNT(*) n FROM orders")["n"]>0: return
    products=[
      ("COF-PREM","Cafea Premium","kg",1,95),
      ("TEA-GREEN","Ceai Verde","buc",0,80),
      ("SUGAR","Zahar","buc",0,80),
      ("COF-STD","Cafea Standard","kg",0,80),
      ("SYRUP","Sirop Vanilie","buc",0,80),
    ]
    c=conn()
    c.executemany("INSERT INTO products VALUES(?,?,?,?,?)",products)
    orders=[
      ("COS-12548","Restaurant X","Agent A","PICKING_COMPLETED", "2026-08-09T08:12:00","2026-08-09T08:41:00"),
      ("COS-12549","Hotel Y","Agent B","PICKING_COMPLETED", "2026-08-09T08:20:00","2026-08-09T08:52:00"),
      ("COS-12550","Cafe Z","Agent A","PICKING","2026-08-09T09:02:00",None),
    ]
    c.executemany("INSERT INTO orders(external_id,customer,agent,status,created_at,picking_completed_at) VALUES(?,?,?,?,?,?)",orders)
    ids=[c.execute("SELECT id FROM orders WHERE external_id=?", (x[0],)).fetchone()[0] for x in orders]
    lines=[
      (ids[0],"COF-PREM","Cafea Premium",10,6,"kg"),
      (ids[0],"TEA-GREEN","Ceai Verde",6,0,"buc"),
      (ids[0],"SUGAR","Zahar",20,20,"buc"),
      (ids[1],"COF-STD","Cafea Standard",20,17,"kg"),
      (ids[1],"SYRUP","Sirop Vanilie",10,9,"buc"),
      (ids[2],"COF-PREM","Cafea Premium",8,0,"kg"),
    ]
    c.executemany("INSERT INTO order_lines(order_id,sku,product_name,ordered,picked,unit) VALUES(?,?,?,?,?,?)",lines)
    c.commit(); c.close()

def setting(k, default=None):
    r=db_one("SELECT value FROM settings WHERE key=?",(k,))
    return r["value"] if r else default

def evaluate_order(order_id):
    order=db_one("SELECT * FROM orders WHERE id=?",(order_id,))
    if not order or order["status"]!="PICKING_COMPLETED": return None
    existing=db_one("SELECT * FROM alerts WHERE order_id=?",(order_id,))
    if existing: return existing
    lines=cosys.get_order_lines(order_id)
    alert_lines=[]; worst="INFO"
    global_thr=float(setting("alert_threshold","80"))
    crit_thr=float(setting("critical_threshold","50"))
    for l in lines:
        ordered=float(l["ordered"]); picked=float(l["picked"])
        if ordered<=0: continue
        pct=(picked/ordered)*100
        p=db_one("SELECT * FROM products WHERE sku=?",(l["sku"],))
        critical=bool(p["critical"]) if p else False
        threshold=float(p["threshold"]) if p and p["threshold"] is not None else global_thr
        if picked==0 and setting("zero_alert","1")=="1":
            sev="CRITICAL"
        elif critical and pct < threshold:
            sev="CRITICAL"
        elif pct < crit_thr:
            sev="CRITICAL"
        elif pct < threshold:
            sev="WARNING"
        else:
            sev=None
        if sev:
            alert_lines.append((l,pct,ordered-picked,sev))
            if sev=="CRITICAL": worst="CRITICAL"
            elif worst!="CRITICAL": worst="WARNING"
    if not alert_lines:
        db_exec("INSERT OR IGNORE INTO audit(order_id,event,actor,details,created_at) VALUES(?,?,?,?,?)",
                (order_id,"ORDER_CHECKED","system","Complete — no alert required",now()))
        return None
    msg=[]
    for l,pct,diff,sev in alert_lines:
        msg.append(f"{l['product_name']}: {l['ordered']:g} {l['unit']} comandat / {l['picked']:g} pregatit — lipsa {diff:g} ({pct:.0f}%)")
    title="COMANDA NECOMPLETA" if worst=="WARNING" else "COMANDA NECOMPLETA — CRITIC"
    aid=db_exec("""INSERT INTO alerts(order_id,severity,title,message,created_at) VALUES(?,?,?,?,?)""",
                (order_id,worst,title,"\n".join(msg),now()))
    db_exec("UPDATE orders SET alert_sent=1 WHERE id=?",(order_id,))
    db_exec("INSERT INTO audit(order_id,event,actor,details,created_at) VALUES(?,?,?,?,?)",
            (order_id,"ALERT_CREATED","system",title,now()))
    return db_one("SELECT * FROM alerts WHERE id=?",(aid,))

def evaluate_all():
    for o in db_all("SELECT id FROM orders WHERE status='PICKING_COMPLETED'"):
        evaluate_order(o["id"])

@app.route("/")
def dashboard():
    evaluate_all()
    orders=db_all("SELECT * FROM orders ORDER BY id DESC")
    stats={
      "total":len(orders),
      "complete":sum(1 for o in orders if o["status"]=="PICKING_COMPLETED" and not db_one("SELECT 1 FROM alerts WHERE order_id=?",(o["id"],))),
      "incomplete":db_one("SELECT COUNT(*) n FROM alerts")["n"],
      "critical":db_one("SELECT COUNT(*) n FROM alerts WHERE severity='CRITICAL'")["n"],
      "verification":db_one("SELECT COUNT(*) n FROM alerts WHERE verification_requested_at IS NOT NULL AND resolved_at IS NULL")["n"]
    }
    return render_template("dashboard.html",orders=orders,stats=stats)

@app.route("/order/<int:order_id>")
def order(order_id):
    evaluate_order(order_id)
    o=db_one("SELECT * FROM orders WHERE id=?",(order_id,))
    lines=cosys.get_order_lines(order_id)
    alert=db_one("SELECT * FROM alerts WHERE order_id=?",(order_id,))
    audit=db_all("SELECT * FROM audit WHERE order_id=? ORDER BY id", (order_id,))
    return render_template("order.html",o=o,lines=lines,alert=alert,audit=audit)

@app.post("/alert/<int:alert_id>/ack")
def ack(alert_id):
    a=db_one("SELECT * FROM alerts WHERE id=?",(alert_id,))
    if a:
        db_exec("UPDATE alerts SET acknowledged_at=? WHERE id=?",(now(),alert_id))
        db_exec("INSERT INTO audit(order_id,event,actor,details,created_at) VALUES(?,?,?,?,?)",
                (a["order_id"],"ALERT_ACKNOWLEDGED","agent","Agent marked alert as seen",now()))
    return redirect(url_for("order",order_id=a["order_id"]))

@app.post("/alert/<int:alert_id>/verify")
def verify(alert_id):
    a=db_one("SELECT * FROM alerts WHERE id=?",(alert_id,))
    if a:
        db_exec("UPDATE alerts SET verification_requested_at=? WHERE id=?",(now(),alert_id))
        db_exec("INSERT INTO verifications(alert_id,reason,note,created_at) VALUES(?,?,?,?)",
                (alert_id,"REQUESTED","Agent requested warehouse verification",now()))
        db_exec("INSERT INTO audit(order_id,event,actor,details,created_at) VALUES(?,?,?,?,?)",
                (a["order_id"],"VERIFICATION_REQUESTED","agent","Warehouse verification requested",now()))
    return redirect(url_for("order",order_id=a["order_id"]))

@app.post("/verification/<int:alert_id>/resolve")
def resolve(alert_id):
    a=db_one("SELECT * FROM alerts WHERE id=?",(alert_id,))
    if a:
        reason=request.form.get("reason","Other")
        note=request.form.get("note","")
        db_exec("UPDATE alerts SET resolved_at=? WHERE id=?",(now(),alert_id))
        db_exec("UPDATE verifications SET reason=?,note=?,resolved_at=? WHERE alert_id=? AND resolved_at IS NULL",
                (reason,note,now(),alert_id))
        db_exec("INSERT INTO audit(order_id,event,actor,details,created_at) VALUES(?,?,?,?,?)",
                (a["order_id"],"VERIFICATION_RESOLVED","warehouse",f"{reason}: {note}",now()))
    return redirect(url_for("order",order_id=a["order_id"]))

@app.route("/settings", methods=["GET","POST"])
def settings():
    if request.method=="POST":
        for k in ["alert_threshold","critical_threshold","zero_alert"]:
            if k in request.form:
                db_exec("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (k,request.form[k]))
        return redirect(url_for("settings"))
    products=db_all("SELECT * FROM products ORDER BY name")
    return render_template("settings.html",products=products,
                           alert_threshold=setting("alert_threshold"),
                           critical_threshold=setting("critical_threshold"),
                           zero_alert=setting("zero_alert"))

@app.post("/product/<sku>")
def product_settings(sku):
    critical=1 if request.form.get("critical")=="1" else 0
    threshold=request.form.get("threshold") or None
    db_exec("UPDATE products SET critical=?, threshold=? WHERE sku=?",(critical,threshold,sku))
    return redirect(url_for("settings"))

@app.route("/agent")
def agent():
    evaluate_all()
    alerts=db_all("""SELECT a.*,o.external_id,o.customer,o.agent
                     FROM alerts a JOIN orders o ON o.id=a.order_id
                     ORDER BY a.id DESC""")
    return render_template("agent.html",alerts=alerts)

@app.route("/api/orders")
def api_orders():
    evaluate_all()
    return jsonify([dict(x) for x in db_all("SELECT * FROM orders ORDER BY id DESC")])

@app.route("/export.csv")
def export_csv():
    output=io.StringIO()
    w=csv.writer(output)
    w.writerow(["Order","Customer","Agent","Severity","Alert","Created","Acknowledged","Verification"])
    rows=db_all("""SELECT a.*,o.external_id,o.customer,o.agent FROM alerts a JOIN orders o ON o.id=a.order_id ORDER BY a.id DESC""")
    for r in rows:
        w.writerow([r["external_id"],r["customer"],r["agent"],r["severity"],r["message"],r["created_at"],r["acknowledged_at"],r["verification_requested_at"]])
    bio=io.BytesIO(output.getvalue().encode("utf-8-sig"))
    return send_file(bio, mimetype="text/csv", as_attachment=True, download_name="order_alert_report.csv")

if __name__=="__main__":
    init_db(); seed()
    app.run(host="127.0.0.1", port=5000, debug=True)
