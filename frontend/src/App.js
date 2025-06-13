import React, { useState, useEffect, useRef } from "react";
import {
  ChakraProvider,
  Box,
  VStack,
  HStack,
  Input,
  Button,
  Text,
  useToast,
  Container,
  Flex,
  IconButton,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useDisclosure,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  useColorMode,
  theme as baseTheme,
  extendTheme
} from "@chakra-ui/react";
import { FaTelegram, FaReply, FaUser, FaSignOutAlt, FaMoon, FaSun } from "react-icons/fa";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import io from "socket.io-client";

// Karanlık tema
const theme = extendTheme({
  config: {
    initialColorMode: "dark",
    useSystemColorMode: false,
  },
  styles: {
    global: {
      body: {
        bg: "gray.900",
        color: "white"
      }
    }
  },
  components: {
    Button: {
      baseStyle: {
        _hover: {
          bg: "blue.500"
        }
      }
    }
  }
});

const SERVER_URL = "https://chat-app-bb7l.onrender.com";

function App() {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [room, setRoom] = useState("");
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [privateMessages, setPrivateMessages] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { colorMode, toggleColorMode } = useColorMode();
  const toast = useToast();
  const messagesEndRef = useRef(null);
  const telegramModal = useDisclosure();
  const newRoomModal = useDisclosure();
  const [newRoomName, setNewRoomName] = useState("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      withCredentials: true,
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on("connect", () => {
      console.log("Socket.IO bağlantısı başarılı");
      setIsLoading(false);
      setConnectionError(null);
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket.IO bağlantı hatası:", error);
      setConnectionError("Sunucuya bağlanılamadı. Lütfen daha sonra tekrar deneyin.");
      setIsLoading(false);
    });

    newSocket.on("message", (msg) => {
      setMessages(prev => [...prev, msg]);
      scrollToBottom();
    });

    newSocket.on("roomHistory", (history) => {
      setMessages(history);
      scrollToBottom();
    });

    newSocket.on("privateMessage", (msg) => {
      setPrivateMessages(prev => ({
        ...prev,
        [msg.from.id]: [...(prev[msg.from.id] || []), msg]
      }));
    });

    newSocket.on("error", (error) => {
      toast({
        title: "Hata",
        description: error,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleTelegramLogin = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/telegram/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code: verificationCode })
      });

      const data = await response.json();

      if (data.success) {
        setUser(data.user);
        socket.emit("authenticate", { userId: data.user.id });
        telegramModal.onClose();
        toast({
          title: "Giriş başarılı",
          description: `Hoş geldiniz, ${data.user.displayName}!`,
          status: "success",
          duration: 3000,
          isClosable: true
        });
      } else {
        toast({
          title: "Hata",
          description: data.error,
          status: "error",
          duration: 3000,
          isClosable: true
        });
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "Doğrulama işlemi başarısız oldu",
        status: "error",
        duration: 3000,
        isClosable: true
      });
    }
  };

  const handleJoinRoom = (roomName) => {
    if (!user) return;
    
    socket.emit("join", { room: roomName });
    setSelectedRoom(roomName);
    setRoom(roomName);
    onClose();
  };

  const handleCreateRoom = () => {
    if (!user?.isAdmin) {
      toast({
        title: "Yetki hatası",
        description: "Sadece adminler yeni oda oluşturabilir",
        status: "error",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    socket.emit("join", { room: newRoomName });
    setSelectedRoom(newRoomName);
    setRoom(newRoomName);
    setNewRoomName("");
    newRoomModal.onClose();
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim() || !room || !user) return;

    socket.emit("message", {
      room,
      text: message,
      replyTo: replyTo?.id
    });

    setMessage("");
    setReplyTo(null);
  };

  const handleSendPrivateMessage = (to, text) => {
    if (!text.trim() || !user) return;

    socket.emit("privateMessage", { to, text });
  };

  const handleReply = (message) => {
    setReplyTo(message);
    document.getElementById("messageInput").focus();
  };

  if (isLoading) {
    return (
      <ChakraProvider theme={theme}>
        <Box
          h="100vh"
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="gray.900"
        >
          <VStack spacing={4}>
            <Text fontSize="xl">Yükleniyor...</Text>
            <Text color="gray.500">Sunucuya bağlanılıyor</Text>
          </VStack>
        </Box>
      </ChakraProvider>
    );
  }

  if (connectionError) {
    return (
      <ChakraProvider theme={theme}>
        <Box
          h="100vh"
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="gray.900"
        >
          <VStack spacing={4}>
            <Text color="red.500">{connectionError}</Text>
            <Button onClick={() => window.location.reload()}>
              Yeniden Dene
            </Button>
          </VStack>
        </Box>
      </ChakraProvider>
    );
  }

  if (!user) {
    return (
      <ChakraProvider theme={theme}>
        <Box
          h="100vh"
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="gray.900"
        >
          <VStack spacing={6} p={8} bg="gray.800" borderRadius="lg" boxShadow="xl">
            <Text fontSize="2xl" fontWeight="bold">
              Sohbet Uygulaması
            </Text>
            <Button
              leftIcon={<FaTelegram />}
              colorScheme="blue"
              onClick={telegramModal.onOpen}
            >
              Telegram ile Giriş Yap
            </Button>
          </VStack>

          <Modal isOpen={telegramModal.isOpen} onClose={telegramModal.onClose}>
            <ModalOverlay />
            <ModalContent bg="gray.800">
              <ModalHeader>Telegram ile Giriş</ModalHeader>
              <ModalCloseButton />
              <ModalBody pb={6}>
                <VStack spacing={4}>
                  <Text>
                    1. Telegram botunu başlatın: @your_bot_username
                  </Text>
                  <Text>
                    2. Bot size bir doğrulama kodu gönderecek
                  </Text>
                  <FormControl>
                    <FormLabel>Doğrulama Kodu</FormLabel>
                    <Input
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="6 haneli kodu girin"
                    />
                  </FormControl>
                  <Button
                    colorScheme="blue"
                    onClick={handleTelegramLogin}
                    isDisabled={!verificationCode}
                  >
                    Giriş Yap
                  </Button>
                </VStack>
              </ModalBody>
            </ModalContent>
          </Modal>
        </Box>
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider theme={theme}>
      <Box h="100vh" bg="gray.900">
        <Flex h="100%">
          {/* Sol Sidebar - Odalar */}
          <Box
            w="250px"
            bg="gray.800"
            p={4}
            borderRight="1px"
            borderColor="gray.700"
          >
            <VStack spacing={4} align="stretch">
              <HStack justify="space-between">
                <Text fontSize="lg" fontWeight="bold">
                  Odalar
                </Text>
                {user.isAdmin && (
                  <IconButton
                    icon={<FaUser />}
                    size="sm"
                    onClick={newRoomModal.onOpen}
                  />
                )}
              </HStack>
              <VStack spacing={2} align="stretch">
                {rooms.map((r) => (
                  <Button
                    key={r}
                    variant={selectedRoom === r ? "solid" : "ghost"}
                    onClick={() => handleJoinRoom(r)}
                    justifyContent="flex-start"
                  >
                    {r}
                  </Button>
                ))}
              </VStack>
            </VStack>
          </Box>

          {/* Ana Sohbet Alanı */}
          <Box flex={1} display="flex" flexDirection="column">
            {/* Üst Bar */}
            <HStack
              p={4}
              bg="gray.800"
              borderBottom="1px"
              borderColor="gray.700"
              justify="space-between"
            >
              <Text fontSize="lg" fontWeight="bold">
                {selectedRoom || "Oda Seçin"}
              </Text>
              <HStack>
                <IconButton
                  icon={colorMode === "dark" ? <FaSun /> : <FaMoon />}
                  onClick={toggleColorMode}
                  variant="ghost"
                />
                <Menu>
                  <MenuButton
                    as={Button}
                    leftIcon={<FaUser />}
                    variant="ghost"
                  >
                    {user.displayName}
                    {user.isAdmin && (
                      <Badge ml={2} colorScheme="red">
                        Admin
                      </Badge>
                    )}
                  </MenuButton>
                  <MenuList bg="gray.800">
                    <MenuItem
                      icon={<FaSignOutAlt />}
                      onClick={() => setUser(null)}
                    >
                      Çıkış Yap
                    </MenuItem>
                  </MenuList>
                </Menu>
              </HStack>
            </HStack>

            {/* Mesajlar */}
            <Box
              flex={1}
              p={4}
              overflowY="auto"
              css={{
                "&::-webkit-scrollbar": {
                  width: "4px"
                },
                "&::-webkit-scrollbar-track": {
                  width: "6px"
                },
                "&::-webkit-scrollbar-thumb": {
                  background: "gray.600",
                  borderRadius: "24px"
                }
              }}
            >
              <VStack spacing={4} align="stretch">
                {messages.map((msg, index) => (
                  <Box
                    key={index}
                    p={3}
                    bg={msg.name === "Sistem" ? "gray.700" : "gray.800"}
                    borderRadius="md"
                    position="relative"
                  >
                    <HStack justify="space-between" mb={1}>
                      <HStack>
                        <Text
                          fontWeight="bold"
                          color={msg.name === "Sistem" ? "gray.400" : "blue.400"}
                        >
                          {msg.name}
                          {msg.isAdmin && (
                            <Badge ml={2} colorScheme="red">
                              Admin
                            </Badge>
                          )}
                        </Text>
                        <Text fontSize="sm" color="gray.500">
                          {format(new Date(msg.timestamp), "HH:mm", {
                            locale: tr
                          })}
                        </Text>
                      </HStack>
                      <IconButton
                        icon={<FaReply />}
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReply(msg)}
                      />
                    </HStack>
                    {msg.replyTo && (
                      <Box
                        mb={2}
                        p={2}
                        bg="gray.700"
                        borderRadius="md"
                        fontSize="sm"
                      >
                        <Text color="gray.400">
                          {msg.replyTo.name}: {msg.replyTo.text}
                        </Text>
                      </Box>
                    )}
                    <Text>{msg.text}</Text>
                  </Box>
                ))}
                <div ref={messagesEndRef} />
              </VStack>
            </Box>

            {/* Mesaj Gönderme Formu */}
            <Box p={4} bg="gray.800" borderTop="1px" borderColor="gray.700">
              <form onSubmit={handleSendMessage}>
                <VStack spacing={2}>
                  {replyTo && (
                    <HStack
                      w="100%"
                      p={2}
                      bg="gray.700"
                      borderRadius="md"
                      justify="space-between"
                    >
                      <Text fontSize="sm" color="gray.400">
                        Yanıtlanıyor: {replyTo.name}
                      </Text>
                      <IconButton
                        icon={<FaSignOutAlt />}
                        size="sm"
                        variant="ghost"
                        onClick={() => setReplyTo(null)}
                      />
                    </HStack>
                  )}
                  <HStack w="100%">
                    <Input
                      id="messageInput"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Mesajınızı yazın..."
                      bg="gray.700"
                      _hover={{ bg: "gray.600" }}
                      _focus={{ bg: "gray.600" }}
                    />
                    <Button
                      type="submit"
                      colorScheme="blue"
                      isDisabled={!message.trim()}
                    >
                      Gönder
                    </Button>
                  </HStack>
                </VStack>
              </form>
            </Box>
          </Box>

          {/* Sağ Sidebar - Kullanıcılar */}
          <Box
            w="250px"
            bg="gray.800"
            p={4}
            borderLeft="1px"
            borderColor="gray.700"
          >
            <VStack spacing={4} align="stretch">
              <Text fontSize="lg" fontWeight="bold">
                Kullanıcılar
              </Text>
              <VStack spacing={2} align="stretch">
                {users.map((u) => (
                  <Button
                    key={u.id}
                    variant="ghost"
                    onClick={() => setSelectedUser(u)}
                    justifyContent="flex-start"
                  >
                    {u.displayName}
                    {u.isAdmin && (
                      <Badge ml={2} colorScheme="red">
                        Admin
                      </Badge>
                    )}
                  </Button>
                ))}
              </VStack>
            </VStack>
          </Box>
        </Flex>

        {/* Yeni Oda Modalı */}
        <Modal isOpen={newRoomModal.isOpen} onClose={newRoomModal.onClose}>
          <ModalOverlay />
          <ModalContent bg="gray.800">
            <ModalHeader>Yeni Oda Oluştur</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              <VStack spacing={4}>
                <FormControl>
                  <FormLabel>Oda Adı</FormLabel>
                  <Input
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Oda adını girin"
                  />
                </FormControl>
                <Button
                  colorScheme="blue"
                  onClick={handleCreateRoom}
                  isDisabled={!newRoomName}
                >
                  Oluştur
                </Button>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Özel Mesaj Modalı */}
        <Modal
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        >
          <ModalOverlay />
          <ModalContent bg="gray.800">
            <ModalHeader>
              {selectedUser?.displayName} ile Sohbet
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              <VStack spacing={4}>
                <Box
                  h="300px"
                  w="100%"
                  overflowY="auto"
                  p={4}
                  bg="gray.700"
                  borderRadius="md"
                >
                  {privateMessages[selectedUser?.id]?.map((msg, index) => (
                    <Box
                      key={index}
                      p={2}
                      bg={msg.from.id === user.id ? "blue.500" : "gray.600"}
                      borderRadius="md"
                      alignSelf={
                        msg.from.id === user.id ? "flex-end" : "flex-start"
                      }
                      maxW="80%"
                      mb={2}
                    >
                      <Text fontSize="sm" color="gray.400">
                        {format(new Date(msg.timestamp), "HH:mm", {
                          locale: tr
                        })}
                      </Text>
                      <Text>{msg.text}</Text>
                    </Box>
                  ))}
                </Box>
                <HStack w="100%">
                  <Input
                    placeholder="Mesajınızı yazın..."
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && e.target.value.trim()) {
                        handleSendPrivateMessage(
                          selectedUser.id,
                          e.target.value
                        );
                        e.target.value = "";
                      }
                    }}
                  />
                </HStack>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>
      </Box>
    </ChakraProvider>
  );
}

export default App; 