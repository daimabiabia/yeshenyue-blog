# TCP/IP：物联网视角速查

## 1. 分层地图（osi 精简到 IoT 实用 5 层）

```text
应用层   HTTP / MQTT / CoAP / Modbus TCP
传输层   TCP(可靠) / UDP(快、省)
网络层   IP / ICMP / 路由
链路层   Ethernet / WiFi / 802.15.4 / 蜂窝
物理层   双绞线 / 射频 / 光纤
```

## 2. TCP 三次握手 & 四次挥手（面试钉子户）

```text
握手：SYN → SYN+ACK → ACK         （为什么三次：双方都要确认收发能力）
挥手：FIN → ACK ← FIN → ACK       （TIME_WAIT 等 2MSL 防旧包串台）
```

IoT 相关：设备频繁断连要注意 TIME_WAIT 堆积；TCP KeepAlive 默认 2 小时，**自己应用层心跳才是真心跳**（MQTT KeepAlive 就是这么来的）。

## 3. 必知协议号与端口

| 端口 | 服务 |
|---|---|
| 1883 / 8883 | MQTT 明文 / TLS |
| 5683 / 5684 | CoAP UDP / DTLS |
| 53 / 67 | DNS / DHCP |
| 80 / 443 | HTTP / HTTPS |

## 4. IP 基础与子网

- 私有段：10.0.0.0/8、172.16/12、192.168/16 —— 家庭路由器多为 192.168.x.x
- /24 = 254 台可用主机；算子网口诀：**掩码 1 的个数定网络位，剩下的是主机位，2^n-2 台**
- IPv6 物联网意义：全球唯一地址免 NAT、SLAAC 自动配网，Thread 就建立在它上面

## 5. NAT 与设备直连难题

- 设备在内网，公网服务器能主动连它吗？——不能，NAT 只保留出站映射
- 穿透手段：端口映射、UPnP、STUN/TURN（P2P 摄像头看家的那套）
- 所以 IoT 的主流架构是**设备主动长连接到云**（MQTT 反向控制就是这么绕开 NAT 的）

## 6. DNS / DHCP / mDNS

- DHCP：设备上电自动拿 IP（路由器分发，租约续期）
- DNS：域名 → IP；设备端建议写死备用 DNS（8.8.8.8 / 223.5.5.5）
- mDNS（Bonjour/.local）：局域网无路由器发现，`mydevice.local` —— 智能家居调试利器

## 7. 抓包排查方法论

```bash
tcpdump -i wlan0 host 192.168.1.50 -w cap.pcap   # 设备侧抓包
Wireshark 打开 → 过滤 mqtt / dns / tcp.flags.syn==1
```

三板斧顺序：**ping 通不通（网络）→ 端口通不通（telnet/nc，传输）→ 协议对不对（抓包，应用）**。

## 8. 常见坑速记

- MTU 1500：VPN/PPPoE 会变小，TLS 握手大包被吞 → clamp MSS
- 多网卡设备默认路由走错出口 → 加静态路由
- 蜂窝模块运营商 NAT 超时几分钟 → 心跳必须短于它
