import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, MessageSquare, Send, Phone, Clock, Users } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  phone: string;
  direction: string;
  message_type: string;
  content: string;
  metadata: any;
  created_at: string;
}

interface Conversation {
  phone: string;
  messages: Message[];
  lastMessage: Message;
  totalMessages: number;
}

const MessageLogs = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch conversations
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await fetch('/admin/messages/conversations');
      if (!response.ok) throw new Error('Failed to fetch conversations');
      const data = await response.json();
      return data.conversations as Conversation[];
    }
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ phone, message }: { phone: string; message: string }) => {
      const response = await fetch('/admin/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone, message }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send message');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast.success('Message sent successfully!');
      setCustomMessage("");
      setIsDialogOpen(false);
      // Refresh conversations
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to send message: ${error.message}`);
    },
  });

  const handleSendMessage = () => {
    if (!selectedPhone || !customMessage.trim()) {
      toast.error('Please select a phone number and enter a message');
      return;
    }

    sendMessageMutation.mutate({
      phone: selectedPhone,
      message: customMessage.trim(),
    });
  };

  const filteredConversations = conversations?.filter(conversation => {
    const matchesSearch = conversation.phone.includes(searchTerm) ||
                         conversation.lastMessage?.content?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  }) || [];

  const selectedConversation = selectedPhone ? 
    conversations?.find(conv => conv.phone === selectedPhone) : null;

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'inbound': return 'bg-blue-100 text-blue-800';
      case 'outbound': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getMessageTypeColor = (messageType: string) => {
    switch (messageType) {
      case 'text': return 'bg-gray-100 text-gray-800';
      case 'image': return 'bg-purple-100 text-purple-800';
      case 'document': return 'bg-orange-100 text-orange-800';
      case 'audio': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return <div className="p-6">Loading conversations...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Message Logs</h1>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <MessageSquare className="h-4 w-4 mr-2" />
                Send Custom Message
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Send Custom Message</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Phone Number</label>
                  <Input
                    placeholder="Enter phone number (e.g., +1234567890)"
                    value={selectedPhone || ""}
                    onChange={(e) => setSelectedPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Message</label>
                  <Textarea
                    placeholder="Enter your message..."
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    rows={4}
                  />
                </div>
                <Button 
                  onClick={handleSendMessage}
                  disabled={sendMessageMutation.isPending}
                  className="w-full"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendMessageMutation.isPending ? 'Sending...' : 'Send Message'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversations List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Conversations ({filteredConversations.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {filteredConversations.map((conversation) => (
                  <div
                    key={conversation.phone}
                    className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedPhone === conversation.phone ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                    onClick={() => setSelectedPhone(conversation.phone)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{conversation.phone}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {conversation.totalMessages}
                      </Badge>
                    </div>
                    
                    {conversation.lastMessage && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge className={getDirectionColor(conversation.lastMessage.direction)}>
                            {conversation.lastMessage.direction}
                          </Badge>
                          <Badge className={getMessageTypeColor(conversation.lastMessage.message_type)}>
                            {conversation.lastMessage.message_type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {conversation.lastMessage.content || 'No content'}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTime(conversation.lastMessage.created_at)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Conversation Detail */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>
                  {selectedConversation ? 
                    `Conversation with ${selectedConversation.phone}` : 
                    'Select a conversation'
                  }
                </span>
                {selectedConversation && (
                  <Button 
                    size="sm" 
                    onClick={() => {
                      setIsDialogOpen(true);
                    }}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Message
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedConversation ? (
                <ScrollArea className="h-[550px]">
                  <div className="space-y-4">
                    {selectedConversation.messages
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((message, index) => (
                      <div key={message.id} className="space-y-2">
                        <div className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] p-3 rounded-lg ${
                            message.direction === 'outbound' 
                              ? 'bg-blue-500 text-white' 
                              : 'bg-gray-100 text-gray-900'
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge 
                                variant="secondary" 
                                className={`text-xs ${
                                  message.direction === 'outbound' 
                                    ? 'bg-blue-600 text-white' 
                                    : getMessageTypeColor(message.message_type)
                                }`}
                              >
                                {message.message_type}
                              </Badge>
                              <span className={`text-xs ${
                                message.direction === 'outbound' ? 'text-blue-100' : 'text-muted-foreground'
                              }`}>
                                {formatTime(message.created_at)}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">
                              {message.content || 'No content'}
                            </p>
                            {message.metadata && Object.keys(message.metadata).length > 0 && (
                              <details className="mt-2">
                                <summary className={`text-xs cursor-pointer ${
                                  message.direction === 'outbound' ? 'text-blue-100' : 'text-muted-foreground'
                                }`}>
                                  Metadata
                                </summary>
                                <pre className={`text-xs mt-1 p-2 rounded overflow-auto max-h-20 ${
                                  message.direction === 'outbound' 
                                    ? 'bg-blue-600 text-blue-100' 
                                    : 'bg-gray-200 text-gray-800'
                                }`}>
                                  {JSON.stringify(message.metadata, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                        {index < selectedConversation.messages.length - 1 && (
                          <Separator className="my-2" />
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex items-center justify-center h-[550px] text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a conversation to view messages</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MessageLogs;