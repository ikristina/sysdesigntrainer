# App state (mocked: the sysdesign MCP server is offline for this test)

## get_lesson() returns
```json
{
 "id": "job-scheduler",
 "title": "Job scheduler: durable, at least once, at scale",
 "variant": "platform",
 "step": "twist",
 "requirements": [
  "8k jobs/s submitted",
  "jobs start within 1 s",
  "at least once",
  "p99 < 300 ms on submit",
  "cost < $10/hr"
 ],
 "twist": "Midnight: every daily cron fires at once. Apply with spike(multiplier=3, seconds=20).",
 "twist_applied": true,
 "checks": "all green"
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
    "replicas": 22
   }
  },
  {
   "id": "q",
   "type": "kafka",
   "params": {
    "partitions": 45
   }
  },
  {
   "id": "w",
   "type": "worker",
   "params": {
    "replicas": 45
   }
  },
  {
   "id": "db",
   "type": "kv",
   "params": {
    "replicas": 3
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
   "id": "api-db",
   "source": "api",
   "target": "db"
  },
  {
   "id": "api-q",
   "source": "api",
   "target": "q",
   "carries": "write"
  },
  {
   "id": "q-w",
   "source": "q",
   "target": "w"
  },
  {
   "id": "w-db",
   "source": "w",
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
restore_node(id), partition_region(id), highlight(node_ids, message=""), set_requirements(...), advance_step(), give_hint(level)
```

Lesson files: lessons/<id>.json in the System Design Trainer repo (read-only).
