# App state (mocked: the sysdesign MCP server is offline for this test)

## get_lesson() returns
```json
{
 "id": "ad-click-aggregation",
 "title": "Ad click aggregation",
 "variant": "dashboards",
 "step": "twist",
 "twist": "An aggregator host crashes: kill_replica on the aggregator block for 10 s, then restore_replica. ... (see lessons/ad-click-aggregation.json)",
 "twist_applied": "part 1 done: kill_replica('agg') for 10 s, then restore_replica('agg')",
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
    "replicas": 25
   }
  },
  {
   "id": "s",
   "type": "kafka",
   "params": {
    "partitions": 5
   }
  },
  {
   "id": "agg",
   "type": "service",
   "params": {
    "replicas": 5,
    "capacity_rps": 5000
   }
  },
  {
   "id": "db",
   "type": "sql_db",
   "params": {}
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
   "id": "api-s",
   "source": "api",
   "target": "s",
   "carries": "write"
  },
  {
   "id": "s-agg",
   "source": "s",
   "target": "agg"
  },
  {
   "id": "api-db",
   "source": "api",
   "target": "db",
   "carries": "read"
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
