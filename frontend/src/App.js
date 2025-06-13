import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  Input,
  VStack,
  HStack,
  Text,
  Heading,
  useToast,
  Avatar,
  Flex,
  Spacer,
  IconButton,
  Divider,
  List,
  ListItem,
  useColorModeValue,
  Grid,
  GridItem,
} from "@chakra-ui/react";
import { ArrowForwardIcon, AddIcon, ChatIcon } from "@chakra-ui/icons";
import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:5000";

function App() {
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [room, setRoom] = useState("");
  const [rooms, setRooms] = useState(["Genel", "Sohbet", "Yazılım"]);
  const [newRoom, setNewRoom] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [users, setUsers] = useState([]);
  const socketRef = useRef(null);
  const toast = useToast();
  const chatBg = useColorModeValue("gray.50", "gray.800");
  const bubbleBg = useColorModeValue("white", "gray.700");
  const sidebarBg = useColorModeValue("white", "gray.700");

  useEffect(() => {
    if (inRoom) {
      socketRef.current = io(SERVER_URL);
      socketRef.current.emit("join", { room, name: username });
      
      socketRef.current.on("message", (msg) => {
        setMessages((prev) => [...prev, msg]);
      });

      socketRef.current.on("userList", (userList) => {
        setUsers(userList);
      });

      return () => {
        socketRef.current.disconnect();
      };
    }
  }, [inRoom, room, username]);

  function handleSetUsername() {
    if (usernameInput.trim().length < 3) {
      toast({ title: "Kullanıcı adı en az 3 karakter olmalı.", status: "warning" });
      return;
    }
    setUsername(usernameInput.trim());
  }

  function handleAddRoom() {
    const r = newRoom.trim();
    if (r.length < 3) {
      toast({ title: "Oda adı en az 3 karakter olmalı.", status: "warning" });
      return;
    }
    if (!rooms.includes(r)) {
      setRooms([...rooms, r]);
      setNewRoom("");
    } else {
      toast({ title: "Bu oda zaten var.", status: "info" });
    }
  }

  const sendMessage = (e) => {
    e.preventDefault();
    if (input.trim()) {
      socketRef.current.emit("message", { room, name: username, text: input });
      setInput("");
    }
  };

  if (!username) {
    return (
      <Flex minH="100vh" align="center" justify="center" bgGradient="linear(to-br, blue.100, purple.200)">
        <Box bg="white" p={8} rounded="xl" shadow="lg" minW="320px">
          <Heading size="md" mb={4} textAlign="center">Kullanıcı Adı Seç</Heading>
          <Input
            placeholder="Kullanıcı adın"
            value={usernameInput}
            onChange={e => setUsernameInput(e.target.value)}
            mb={3}
            onKeyDown={e => e.key === "Enter" && handleSetUsername()}
          />
          <Button colorScheme="blue" w="100%" onClick={handleSetUsername}>
            Devam Et
          </Button>
        </Box>
      </Flex>
    );
  }

  if (!inRoom) {
    return (
      <Flex minH="100vh" align="center" justify="center" bgGradient="linear(to-br, blue.100, purple.200)">
        <Box bg="white" p={8} rounded="xl" shadow="lg" minW="350px">
          <Heading size="md" mb={4} textAlign="center">Sohbet Odaları</Heading>
          <VStack spacing={3} mb={4} align="stretch">
            {rooms.map((r, i) => (
              <Button
                key={i}
                colorScheme="purple"
                variant="outline"
                rightIcon={<ArrowForwardIcon />}
                onClick={() => { setRoom(r); setInRoom(true); }}
              >
                {r}
              </Button>
            ))}
          </VStack>
          <Divider my={3} />
          <HStack>
            <Input
              placeholder="Yeni oda adı"
              value={newRoom}
              onChange={e => setNewRoom(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddRoom()}
            />
            <IconButton
              colorScheme="blue"
              icon={<AddIcon />}
              onClick={handleAddRoom}
              aria-label="Oda ekle"
            />
          </HStack>
        </Box>
      </Flex>
    );
  }

  return (
    <Grid
      templateColumns="250px 1fr 300px"
      h="100vh"
      bg={useColorModeValue("gray.50", "gray.900")}
    >
      {/* User List - Left Sidebar */}
      <GridItem bg={sidebarBg} borderRight="1px" borderColor="gray.200">
        <Box p={4}>
          <Heading size="sm" mb={4}>Kullanıcılar</Heading>
          <List spacing={2}>
            {users.map((user, i) => (
              <ListItem key={i} display="flex" alignItems="center">
                <Avatar size="sm" name={user} mr={2} />
                <Text>{user}</Text>
              </ListItem>
            ))}
          </List>
        </Box>
      </GridItem>

      {/* Chat Area - Middle */}
      <GridItem>
        <Flex direction="column" h="100%">
          <Flex align="center" p={4} borderBottom="1px" bg="purple.500">
            <Avatar name={username} size="sm" mr={2} />
            <Text color="white" fontWeight="bold">{room}</Text>
            <Spacer />
            <Button size="sm" colorScheme="gray" variant="ghost" onClick={() => { setInRoom(false); setMessages([]); }}>
              Odalara Dön
            </Button>
          </Flex>

          <Box flex="1" bg={chatBg} overflowY="auto" px={4} py={2} style={{ backgroundImage: "url('https://telegram.org/img/bg_pattern_1.png')", backgroundSize: "auto" }}>
            <VStack spacing={2} align="stretch">
              {messages.map((msg, i) => (
                <Flex key={i} justify={msg.name === username ? "flex-end" : "flex-start"}>
                  <Box
                    bg={msg.name === username ? "purple.400" : bubbleBg}
                    color={msg.name === username ? "white" : "gray.800"}
                    px={4}
                    py={2}
                    rounded="xl"
                    maxW="70%"
                    boxShadow="md"
                  >
                    <Text fontSize="sm" fontWeight="bold">{msg.name}</Text>
                    <Text>{msg.text}</Text>
                  </Box>
                </Flex>
              ))}
            </VStack>
          </Box>

          <Box p={3} borderTop="1px" bg="white">
            <form onSubmit={sendMessage}>
              <HStack>
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Mesaj yaz..."
                  bg="gray.100"
                  _focus={{ bg: "gray.200" }}
                />
                <Button colorScheme="purple" type="submit" px={6}>
                  Gönder
                </Button>
              </HStack>
            </form>
          </Box>
        </Flex>
      </GridItem>

      {/* Channels - Right Sidebar */}
      <GridItem bg={sidebarBg} borderLeft="1px" borderColor="gray.200">
        <Box p={4}>
          <Heading size="sm" mb={4}>Kanallar</Heading>
          <VStack spacing={3} align="stretch">
            {rooms.map((r, i) => (
              <Button
                key={i}
                leftIcon={<ChatIcon />}
                variant={r === room ? "solid" : "ghost"}
                colorScheme="purple"
                justifyContent="flex-start"
                h="auto"
                py={3}
                onClick={() => {
                  if (r !== room) {
                    setRoom(r);
                    setMessages([]);
                  }
                }}
              >
                <Box>
                  <Text fontWeight="bold">{r}</Text>
                  <Text fontSize="sm" color="gray.500">Aktif kullanıcılar: {users.length}</Text>
                </Box>
              </Button>
            ))}
          </VStack>
          <Divider my={4} />
          <HStack>
            <Input
              placeholder="Yeni kanal adı"
              value={newRoom}
              onChange={e => setNewRoom(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddRoom()}
            />
            <IconButton
              colorScheme="blue"
              icon={<AddIcon />}
              onClick={handleAddRoom}
              aria-label="Kanal ekle"
            />
          </HStack>
        </Box>
      </GridItem>
    </Grid>
  );
}

export default App; 