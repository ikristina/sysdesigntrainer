# App state (mocked: the sysdesign MCP server is offline for this test)

## get_lesson() returns
```json
{
 "id": "url-shortener",
 "title": "URL Shortener",
 "variant": "read-heavy",
 "step": "twist",
 "requirements": [
  "99% reads (redirects), 1% writes",
  "10k rps peak",
  "p99 < 250 ms",
  "errors < 0.1%",
  "cost < $3/hr"
 ],
 "twist": "A celebrity posts a short link: traffic x5 for 60 s. Apply with spike(5, 60).",
 "twist_applied": true,
 "checks": "writes failing (errors 1%)",
 "faults": "custom twist applied 20 s ago: kill_primary('db'). Kristina has explained what broke."
}
```

## get_design() returns
```json
{
 "version": 1,
 "nodes": [
  {
   "id": "c",
   "type": "client",
   "params": {}
  },
  {
   "id": "lb",
   "type": "load_balancer",
   "params": {}
  },
  {
   "id": "api",
   "type": "service",
   "params": {
    "replicas": 4,
    "capacity_rps": 3000
   }
  },
  {
   "id": "cache",
   "type": "redis",
   "params": {
    "hit_ratio": 0.9,
    "replicas": 1,
    "when_down": "fail"
   }
  },
  {
   "id": "db",
   "type": "postgres",
   "params": {
    "read_replicas": 1,
    "pool_size": 20
   }
  }
 ],
 "edges": [
  {
   "id": "c-lb",
   "source": "c",
   "target": "lb"
  },
  {
   "id": "lb-api",
   "source": "lb",
   "target": "api"
  },
  {
   "id": "api-cache",
   "source": "api",
   "target": "cache"
  },
  {
   "id": "cache-db",
   "source": "cache",
   "target": "db"
  }
 ]
}
```

## sysdesign MCP tools available
```
get_lesson(), get_design(), get_metrics(), run(on=True), set_traffic(rps, read_ratio, hot_key, payload_kb, followers, following),
spike(multiplier=3, seconds=10), kill_node(id), kill_replica(id, count=1), restore_replica(id, count=1),
kill_primary(id)  # single-primary SQL only (blocks with a read_replicas param)
promote_replica(id)  # fail over: a read replica becomes the primary, read_replicas - 1
restore_node(id), partition_region(id), highlight(node_ids, message=""), set_requirements(...), advance_step(), give_hint(level)
```

Lesson files: lessons/<id>.json in the System Design Trainer repo (read-only).
