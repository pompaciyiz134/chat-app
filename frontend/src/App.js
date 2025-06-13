import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { useSearchParams } from "react-router-dom";
import "./App.css";

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

// Telegram Login Widget script'ini ekle
const TelegramLoginWidget = () => {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", "klfh_bot");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.async = true;

    // Telegram auth callback fonksiyonunu global scope'a ekle
    window.onTelegramAuth = (user) => {
      console.log("Telegram auth başarılı:", user);
      // Backend'e doğrulama isteği gönder
      fetch("https://chat-app-bb7l.onrender.com/api/telegram/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: user.id,
          first_name: user.first_name,
          username: user.username,
          photo_url: user.photo_url,
          auth_date: user.auth_date,
          hash: user.hash
        }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setUsername(data.username);
          setShowLogin(false);
          setShowChat(true);
        } else {
          alert("Doğrulama başarısız: " + data.message);
        }
      })
      .catch(error => {
        console.error("Doğrulama hatası:", error);
        alert("Doğrulama sırasında bir hata oluştu");
      });
    };

    document.getElementById("telegram-login-container").appendChild(script);

    return () => {
      // Cleanup
      document.getElementById("telegram-login-container").removeChild(script);
      delete window.onTelegramAuth;
    };
  }, []);

  return <div id="telegram-login-container" className="telegram-login-container"></div>;
};

function App() {
  // URL parametreleri
  const [searchParams] = useSearchParams();

  // State tanımlamaları
  const [state, setState] = useState({
    username: "",
    message: "",
    messages: [],
    room: "genel",
    showLogin: true,
    showChat: false,
    users: [],
    isLoading: true,
    connectionError: false,
    verificationError: ""
  });

  // State güncelleme fonksiyonu
  const updateState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Refs
  const messagesEndRef = useRef(null);
  const socketRef = useRef();

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { colorMode, toggleColorMode } = useColorMode();
  const toast = useToast();
  const telegramModal = useDisclosure();
  const newRoomModal = useDisclosure();
  const [newRoomName, setNewRoomName] = useState("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Backend bağlantısını kontrol et
  useEffect(() => {
    const checkBackendConnection = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/`);
        if (response.ok) {
          updateState({ isLoading: false, connectionError: false });
        } else {
          throw new Error("Backend bağlantısı başarısız");
        }
      } catch (error) {
        console.error("Backend bağlantı hatası:", error);
        updateState({ isLoading: false, connectionError: true });
      }
    };

    checkBackendConnection();
  }, [updateState]);

  // Deep link token kontrolü
  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      console.log("Deep link token bulundu:", token);
      verifyDeepLinkToken(token);
    }
  }, [searchParams]);

  // Deep link token doğrulama
  const verifyDeepLinkToken = async (token) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/telegram/deep-link?token=${token}`);
      const data = await response.json();

      if (data.success) {
        console.log("Deep link doğrulama başarılı:", data);
        updateState({
          username: data.username,
          showLogin: false,
          showChat: true
        });
        initializeSocket(data.userId);
      } else {
        console.error("Deep link doğrulama hatası:", data.message);
        updateState({ verificationError: data.message });
      }
    } catch (error) {
      console.error("Deep link doğrulama hatası:", error);
      updateState({ verificationError: "Doğrulama sırasında bir hata oluştu" });
    }
  };

  // Socket bağlantısını başlat
  const initializeSocket = (userId) => {
    const socket = io(SERVER_URL, {
      withCredentials: true,
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.on("connect", () => {
      console.log("Socket.IO bağlantısı başarılı");
      socket.emit("authenticate", { userId });
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO bağlantı hatası:", error);
      updateState({ connectionError: true });
    });

    socket.on("message", (msg) => {
      updateState(prev => ({
        messages: [...prev.messages, msg]
      }));
      scrollToBottom();
    });

    socket.on("roomHistory", (history) => {
      updateState({ messages: history });
      scrollToBottom();
    });

    socket.on("privateMessage", (msg) => {
      updateState(prev => ({
        privateMessages: {
          ...prev.privateMessages,
          [msg.from.id]: [...(prev.privateMessages[msg.from.id] || []), msg]
        }
      }));
    });

    socket.on("userList", (userList) => {
      updateState({ users: userList });
    });

    socket.on("error", (error) => {
      toast({
        title: "Hata",
        description: error,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    });

    socketRef.current = socket;
  };

  useEffect(() => {
    scrollToBottom();
  }, [state.messages]);

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
        updateState({ user: data.user });
        socketRef.current.emit("authenticate", { userId: data.user.id });
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
    if (!state.user) return;
    
    socketRef.current.emit("join", { room: roomName });
    updateState({ room: roomName });
    onClose();
  };

  const handleCreateRoom = () => {
    if (!state.user?.isAdmin) {
      toast({
        title: "Yetki hatası",
        description: "Sadece adminler yeni oda oluşturabilir",
        status: "error",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    socketRef.current.emit("join", { room: newRoomName });
    updateState({ room: newRoomName });
    setNewRoomName("");
    newRoomModal.onClose();
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!state.message.trim() || !state.room || !state.user) return;

    socketRef.current.emit("message", {
      room: state.room,
      text: state.message,
      replyTo: state.replyTo?.id
    });

    updateState({ message: "" });
    updateState({ replyTo: null });
  };

  const handleSendPrivateMessage = (to, text) => {
    if (!text.trim() || !state.user) return;

    socketRef.current.emit("privateMessage", { to, text });
  };

  const handleReply = (message) => {
    updateState({ replyTo: message });
    document.getElementById("messageInput").focus();
  };

  if (state.isLoading) {
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

  if (state.connectionError) {
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
            <Text color="red.500">{state.connectionError}</Text>
            <Button onClick={() => window.location.reload()}>
              Yeniden Dene
              </Button>
          </VStack>
        </Box>
      </ChakraProvider>
    );
  }

  if (!state.user) {
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
            <TelegramLoginWidget />
          </VStack>
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
                {state.user.isAdmin && (
                  <IconButton
                    icon={<FaUser />}
                    size="sm"
                    onClick={newRoomModal.onOpen}
                  />
                )}
              </HStack>
              <VStack spacing={2} align="stretch">
                {state.rooms.map((r) => (
                  <Button
                    key={r}
                    variant={state.room === r ? "solid" : "ghost"}
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
                {state.room || "Oda Seçin"}
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
                    {state.user.displayName}
                    {state.user.isAdmin && (
                      <Badge ml={2} colorScheme="red">
                        Admin
                      </Badge>
                    )}
                  </MenuButton>
                  <MenuList bg="gray.800">
                    <MenuItem
                      icon={<FaSignOutAlt />}
                      onClick={() => updateState({ user: null })}
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
                {state.messages.map((msg, index) => (
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
                  {state.replyTo && (
                    <HStack
                      w="100%"
                      p={2}
                      bg="gray.700"
                      borderRadius="md"
                      justify="space-between"
                    >
                      <Text fontSize="sm" color="gray.400">
                        Yanıtlanıyor: {state.replyTo.name}
                      </Text>
                      <IconButton
                        icon={<FaSignOutAlt />}
                        size="sm"
                        variant="ghost"
                        onClick={() => updateState({ replyTo: null })}
                      />
                    </HStack>
                  )}
                  <HStack w="100%">
                    <Input
                      id="messageInput"
                      value={state.message}
                      onChange={(e) => updateState({ message: e.target.value })}
                      placeholder="Mesajınızı yazın..."
                      bg="gray.700"
                      _hover={{ bg: "gray.600" }}
                      _focus={{ bg: "gray.600" }}
                    />
                    <Button
                      type="submit"
                      colorScheme="blue"
                      isDisabled={!state.message.trim()}
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
                {state.users.map((u) => (
                  <Button
                    key={u.id}
                    variant="ghost"
                    onClick={() => updateState({ selectedUser: u })}
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
          isOpen={!!state.selectedUser}
          onClose={() => updateState({ selectedUser: null })}
        >
          <ModalOverlay />
          <ModalContent bg="gray.800">
            <ModalHeader>
              {state.selectedUser?.displayName} ile Sohbet
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
                  {state.privateMessages[state.selectedUser?.id]?.map((msg, index) => (
                    <Box
                      key={index}
                      p={2}
                      bg={msg.from.id === state.user.id ? "blue.500" : "gray.600"}
                      borderRadius="md"
                      alignSelf={
                        msg.from.id === state.user.id ? "flex-end" : "flex-start"
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
                          state.selectedUser.id,
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