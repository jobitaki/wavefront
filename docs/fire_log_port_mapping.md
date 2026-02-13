# Fire.log to DOT Port Annotation Mapping (res[n] and op[n])

## Overview
Each value logged in fire.log corresponds to specific input operands (op[n]) or output results (res[n]) in the DOT graph annotations.

---

## Common Instructions

### Arithmetic Operations (add, sub, mul, div, rem, etc.)
**FIRE_LOG Format:** `op[0]_value op[1]_value res[0]_value`

Example from fire.log:
```
[5] (22) mul 0 4 0           # operand0=0, operand1=4, result[0]=0
[5] (49) add_1 1978 5332 7310  # operand0=1978, operand1=5332, result[0]=7310
```

| Position | Maps To | Notes |
|----------|---------|-------|
| 1st value | `op[0]` | First operand (left side) |
| 2nd value | `op[1]` | Second operand (right side) |
| 3rd value | `res[0]` | Result output |

---

### Bitwise Operations (and, or, xor, shl, ashr, lshr)
**FIRE_LOG Format:** `op[0]_value op[1]_value res[0]_value`

Same as arithmetic - binary operations with 2 inputs, 1 output.

---

### Comparisons (eq, ne, lt, gt, le, ge)
**FIRE_LOG Format:** `op[0]_value op[1]_value res[0]_value`

Result is 0 or 1 (boolean).

Example from fire.log:
```
[3] (14) true_steer_4 true 2 true    # See steer section below
```

---

### Type Conversions (extsi, extui, trunci, fptoui, fptosi, sitofp, uitofp, abs, neg)
**FIRE_LOG Format:** `op[0]_value res[0]_value`

Example:
```
[5] (51) extsi_2 0 0         # extsi: op[0]=0, res[0]=0
[5] (52) order 0 0 0         # order: op[0]=0, op[1]=0, res[0]=0 (special case)
[6] (45) trunci_1 0 0        # trunci: op[0]=0, res[0]=0
```

| Position | Maps To |
|----------|---------|
| 1st value | `op[0]` |
| 2nd value | `res[0]` |

---

### Constant & Passthrough (dataflow.constant, dataflow.copy, bitcast, freeze, etc.)
**FIRE_LOG Format:** `res[0]_value`

Example:
```
[2] (0) c0 0                 # constant with value 0 → res[0]=0
[1] (3) copy 58 58           # copy: op[0]=58, res[0]=58
```

| Position | Maps To |
|----------|---------|
| 1st value | `res[0]` |

---

### Steer Instructions (trueSteer, falseSteer, dataflow.steer)

#### 1. **dataflow.steer** (2-output version)
```
inputs:  [condition_instr, data_instr]    # op[0]=condition, op[1]=data
outputs: res[0] or res[1] based on condition
```

**FIRE_LOG Format:** `op[0]_decider op[1]_data channel_output`

Example:
```
[3] (14) true_steer_4 true 2 true      # decider=true, data=2, output_ch=0 (true)
[3] (17) false_steer_2 true 1 false    # decider=true, data=1, output_ch=1 (false)
[3] (13) false_steer true 0 false      # decider=true, data=0, output_ch=1 (false)
```

| Position | Maps To | Notes |
|----------|---------|-------|
| 1st value | `op[0]` | Condition/decider value |
| 2nd value | `op[1]` | Data value to route |
| 3rd value | `res[0]` | Which output channel (0 or 1) was taken |

#### 2. **trueSteer / falseSteer** (1-output version)
```
inputs:  [condition_instr, data_instr]    # op[0]=condition, op[1]=data
outputs: res[0] (conditional, may not fire)
```

**FIRE_LOG Format:** `op[0]_decider op[1]_data condition_met`

Example:
```
[10] (true_steer_2) false 0 false      # decider=false, data=0, fires=false
```

| Position | Maps To | Notes |
|----------|---------|-------|
| 1st value | `op[0]` | Condition value |
| 2nd value | `op[1]` | Data value |
| 3rd value | `res[0]` | Whether fired (if logged) |

---

### Output Instruction
**FIRE_LOG Format:** `op[0]_value`

Example:
```
[4] (58) output_copy 0 0     # output the value 0
```

| Position | Maps To |
|----------|---------|
| 1st value | `op[0]` |

---

### NOP Instructions
**FIRE_LOG Format:** `0`

Always logs "0" regardless of inputs.

---

## Memory Instructions

### Load (dataflow.load, dataflow.loadIndex)

#### LoadIndex (3 inputs)
```
inputs:  [base_instr, offset_instr, order_instr]
outputs: [res[0]=data, res[1]=status]
```

**FIRE_LOG Format:** `op[0]_base op[1]_offset computed_addr op[0]+op[1]*sizeof_computed_result res[0]_data_loaded`

Wait, let me recheck the code...

```cpp
auto [base, offset, order] = gatherInputsAs<3, uint64_t>(tokenMem, t);
auto addr = Address(base + offset * SIZE);
DataValue<8> data = dataMem.access(addr, SIZE, MemReqType::READ);
FIRE_LOG(base, offset, addr.get(), data.as<uint64_t>());
return {{0, Token(t, data.as<uint64_t>())}, {1, Token(t, 0)}};
```

**FIRE_LOG Format:** `op[0]_base op[1]_offset computed_address res[0]_loaded_data`

Example (not in our log, but structure):
```
[n] (id) loadIndex 1000 5 1040 12345
  op[0]=1000 (base)
  op[1]=5 (offset)
  computed_addr=1040
  res[0]=12345 (loaded data)
```

| Position | Maps To | Notes |
|----------|---------|-------|
| 1st value | `op[0]` | Base address |
| 2nd value | `op[1]` | Offset |
| 3rd value | — | Computed address (base + offset * sizeof) |
| 4th value | `res[0]` | Data loaded from memory |
| (implicit) | `res[1]` | Memory status (always 0 in current impl) |

#### Load (2 inputs)
```
inputs:  [address_instr, order_instr]
outputs: [res[0]=data, res[1]=status]
```

**FIRE_LOG Format:** `op[0]_address computed_address res[0]_loaded_data`

Example:
```
[n] (id) load 2000 2000 0x12345678
  op[0]=2000 (address)
  res[0]=0x12345678 (loaded data)
```

| Position | Maps To |
|----------|---------|
| 1st value | `op[0]` |
| 2nd value | — | (address verified/computed) |
| 3rd value | `res[0]` |

---

### Store (dataflow.store, dataflow.storeIndex)

#### StoreIndex (4 inputs)
```
inputs:  [base_instr, offset_instr, data_instr, order_instr]
outputs: [res[0]=status (always 1)]
```

**FIRE_LOG Format:** `op[0]_base op[1]_offset computed_address op[2]_data`

Example:
```
[78] (53) storeIndex 168 3 192 7310
  op[0]=168 (base)
  op[1]=3 (offset)
  computed_addr=192 (168 + 3*sizeof)
  op[2]=7310 (data)
  res[0]=1 (implicit)
```

| Position | Maps To |
|----------|---------|
| 1st value | `op[0]` |
| 2nd value | `op[1]` |
| 3rd value | — | Computed address |
| 4th value | `op[2]` |

#### Store (3 inputs)
```
inputs:  [data_instr, address_instr, order_instr]
outputs: [res[0]=status (always 1)]
```

**FIRE_LOG Format:** `op[1]_address computed_address op[0]_data`

Note: Address is logged first!

```cpp
auto [data, address, order] = gatherInputsAs<3, uint64_t>(tokenMem, t);
FIRE_LOG(address, addr, data);
return {{0, Token(t, 1)}};
```

Example:
```
[n] (id) store 2000 2000 12345
  op[1]=2000 (address) - logged first
  op[0]=12345 (data) - logged last
```

| Position | Maps To | Notes |
|----------|---------|-------|
| 1st value | `op[1]` | **Address (operand 1!)** |
| 2nd value | — | Verified address |
| 3rd value | `op[0]` | **Data (operand 0!)** |

---

### Send Instruction
**FIRE_LOG Format:** `"FAR SEND" op[0]_dest_instr_id op[1]_value`

```cpp
auto destInstructionID = gatherInput(tokenMem, t, 0).as<InstructionID>();
auto value = gatherInput(tokenMem, t, 1);
FIRE_LOG("FAR SEND", destInstructionID, value);
```

Example:
```
[3] (57) send FAR SEND 58 0
  op[0]=58 (destination instruction ID)
  op[1]=0 (value to send)
```

| Position | Maps To |
|----------|---------|
| Label | "FAR SEND" |
| 1st value | `op[0]` |
| 2nd value | `op[1]` |

---

### Alloca Instruction
**FIRE_LOG Format:** `"ALLOCA PROTOTYPE" op[0]_array_size op[1]_elem_size res[0]_address`

```cpp
auto array_size = gatherInput(tokenMem, t, 0).as<uint64_t>();
auto elem_size = gatherInput(tokenMem, t, 1).as<uint64_t>();
uint64_t address = 0x1000;
FIRE_LOG("ALLOCA PROTOTYPE", array_size, elem_size, address);
return {{0, Token(t, address)}};
```

| Position | Maps To |
|----------|---------|
| 1st value | `op[0]` |
| 2nd value | `op[1]` |
| 3rd value | `res[0]` |

---

### Memset Instruction
**FIRE_LOG Format:** `"MEMSET" op[0]_base op[1]_byte_val op[2]_length`

| Position | Maps To |
|----------|---------|
| 1st value | `op[0]` |
| 2nd value | `op[1]` |
| 3rd value | `op[2]` |

---

## RipTide Instructions

### Carry Instruction (riptide.carry)
```
inputs:  [condition_instr, data1_instr, data2_instr, state_instr]
outputs: [res[0]=data, res[1]=next_state]
```

**FIRE_LOG Format:**

#### INIT→BLOCK transition:
`"INIT->BLOCK" res[0]_data`

```cpp
if (state == CarryState::INIT) {
    auto data = gatherInput(tokenMem, t, 1);
    FIRE_LOG("INIT->BLOCK", data);
    return {{0, Token{t, data}}, {1, Token{t, CarryState::BLOCKED}}};
}
```

Example:
```
[2] (5) carry INIT->BLOCK 0
  res[0]=0 (data output)
  res[1]=BLOCKED (implicit state)
```

#### BLOCK→BLOCK transition:
`"BLOCK->BLOCK" res[0]_data`

```cpp
} else {
    if (decider) {
        auto data = gatherInput(tokenMem, t, 2);
        FIRE_LOG("BLOCK->BLOCK", data);
        return {{0, Token{t, data}}, {1, Token{t, CarryState::BLOCKED}}};
    }
}
```

Example:
```
[77] (23) carry_3 BLOCK->BLOCK 7310
  res[0]=7310
```

#### BLOCK→INIT transition:
`"BLOCK->INIT"`

```cpp
} else {
    FIRE_LOG("BLOCK->INIT");
    return {{1, Token{t, CarryState::INIT}}};
}
```

Example:
```
[78] (23) carry_3 BLOCK->INIT
  res[1]=INIT (implicit, no data output)
```

| State | Log Format | Maps To |
|-------|-----------|---------|
| INIT→BLOCK | `"INIT->BLOCK" value` | `res[0]=value, res[1]=BLOCKED` |
| BLOCK→BLOCK | `"BLOCK->BLOCK" value` | `res[0]=value, res[1]=BLOCKED` |
| BLOCK→INIT | `"BLOCK->INIT"` | `res[1]=INIT` |

---

### Invariant Instruction (riptide.invariant)
```
inputs:  [condition_instr, data_instr, state_instr]
outputs: [res[0]=data, res[1]=next_state]
```

**FIRE_LOG Format:** `state_value res[0]_data` or `state_value 0`

```cpp
auto state = gatherInput(tokenMem, t, 2).as<CarryState>();
if (state == CarryState::INIT) {
    auto data = gatherInput(tokenMem, t, 1);
    FIRE_LOG(state, data);
    return {{0, Token{t, data}}, {1, Token{t, CarryState::BLOCKED}}};
} else {
    if (!decider) {
        auto data = gatherInput(tokenMem, t, 1);
        FIRE_LOG(state, data);
        return {{0, Token{t, data}}, {1, Token{t, CarryState::BLOCKED}}};
    } else {
        FIRE_LOG(state, 0);
        return {{1, Token{t, CarryState::INIT}}};
    }
}
```

Example:
```
[5] (25) invariant 0 0
  op[2]=0 (state)
  (conditional logging of data or 0)
```

| Position | Maps To |
|----------|---------|
| 1st value | `op[2]` (state) |
| 2nd value | `res[0]` (data) or 0 if exit |

---

### Merge Instruction (riptide.merge)
```
inputs:  [condition_instr, data1_instr, data2_instr]
outputs: [res[0]=selected_data]
```

**FIRE_LOG Format:** `res[0]_data`

```cpp
auto data = gatherInput(tokenMem, t, decider ? 1 : 2);
FIRE_LOG(data);
pop(tokenMem, t, decider ? 1 : 2);
return {{0, Token{t, data}}};
```

Example:
```
[78] (54) merge 1
  res[0]=1 (merged value from either op[1] or op[2])
```

| Position | Maps To |
|----------|---------|
| 1st value | `res[0]` |

---

### Stream Instruction (riptide.stream)
```
inputs:  [start_instr, bound_instr, step_instr]
outputs: [res[0]=loop_value, res[1]=last_flag, res[2]=next_offset]
```

**FIRE_LOG Format:** `last_flag start bound step offset`

```cpp
auto [start, bound, step, offset] = gatherInputsAs<4, uint64_t>(tokenMem, t);
bool last = start + offset >= bound;
FIRE_LOG(last, start, bound, step, offset);
if (!last) {
    return {{0, Token{t, start + offset}}, 
            {1, Token{t, (uint64_t)pred}}, 
            {2, Token{t, offset + step}}};
} else {
    return {{1, Token{t, (uint64_t)!pred}}, 
            {2, Token{t, 0}}};
}
```

Example:
```
[3] (4) stream false 0 4 1 0
  res[0]=0 (start + offset = 0 + 0)
  res[1]=false (not last iteration)
  res[2]=? (next offset = 0 + 1 = 1)
  
[4] (4) stream false 0 4 1 1
  res[0]=1
  res[1]=false
  res[2]=2
```

| Position | Maps To | Notes |
|----------|---------|-------|
| 1st value | `res[1]` | `last` flag (false=continue, true=exit) |
| 2nd value | `op[0]` | start value |
| 3rd value | `op[1]` | bound value |
| 4th value | `op[2]` | step value |
| 5th value | — | current offset |

---

### TTDA Instructions

#### GetContext (ttda.get_context)
```
inputs:  [control_instr]
outputs: [res[0]=new_tag]
```

**FIRE_LOG Format:** `res[0]_tag_value`

#### ChangeTag (ttda.change_tag)
```
inputs:  [tag_instr, data_instr]
outputs: [res[0]=data_with_new_tag]
```

**FIRE_LOG Format:** `op[0]_tag op[1]_data`

#### ExtractTag (ttda.extract_tag)
```
inputs:  [token_instr]
outputs: [res[0]=tag_value]
```

**FIRE_LOG Format:** `res[0]_tag`

#### TTDAFree (ttda.free_tag)
```
inputs:  [token_instr]
outputs: [none]
```

**FIRE_LOG Format:** `op[0]_tag`

#### Merge (ttda.merge)
```
inputs:  [external_input, internal_input]
outputs: [res[0]=merged_data]
```

**FIRE_LOG Format:** `"EXTERNAL" res[0]_data` or `"INTERNAL" res[0]_data`

Example:
```cpp
if (checkTagPresence(tokenMem, t, 0)) {
    auto data = gatherInput(tokenMem, t, 0);
    FIRE_LOG("EXTERNAL", data);
    return {{0, Token{t, data}}};
} else {
    auto data = gatherInput(tokenMem, t, 1);
    FIRE_LOG("INTERNAL", data);
    return {{0, Token{t, data}}};
}
```

---

## Summary Table

| Instruction | Pattern | op[0] | op[1] | op[2] | op[3] | res[0] | res[1] |
|-------------|---------|-------|-------|-------|-------|--------|--------|
| Binary Arith (add, mul, etc) | `v1 v2 r` | v1 | v2 | — | — | r | — |
| Unary (neg, ext, etc) | `v r` | v | — | — | — | r | — |
| Constant | `r` | — | — | — | — | r | — |
| Steer (2-out) | `dec data ch` | dec | data | — | — | ch | — |
| TrueSteer/FalseSteer | `dec data cond` | dec | data | — | — | — | — |
| Load | `a ? r` | a | — | — | — | r | 0 |
| LoadIndex | `b o ? r` | b | o | — | — | r | 0 |
| Store | `a addr d` | d | a | order | — | 1 | — |
| StoreIndex | `b o addr d` | b | o | d | order | 1 | — |
| Send | `FAR id v` | id | v | — | — | indirect | — |
| Carry | `state-data` | cond | data1 | data2 | state | data | state' |
| Invariant | `s d` | cond | data | state | — | data | state' |
| Merge (RT) | `d` | cond | data1 | data2 | — | d | — |
| Stream | `last s b st off` | start | bound | step | — | loop_val | last |
| TTDA Merge | `EXT/INT d` | ext | int | — | — | d | — |

