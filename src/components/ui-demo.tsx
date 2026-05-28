'use client';

import React, { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { Settings, User, Bell, MoreHorizontal, ChevronRight, ChevronDown, FileText, Layers, FileUp, Link2, Edit, Book, Eye } from 'lucide-react';

interface Structure {
  id: string;
  name: string;
  children?: Structure[];
  level?: number;
  color?: string;
}

const structures: Structure[] = [
  {
    id: '100-002',
    name: 'Rectorado',
    color: 'text-black'
  },
  {
    id: '100-003',
    name: 'Partido Comunista de Cuba',
    color: 'text-red-600',
    children: [
      {
        id: '100-035',
        name: 'Comité PCC-UCI',
        color: 'text-red-500',
        children: [
          {
            id: '100-1192',
            name: 'Comité Primario PCC Fac. 2',
            color: 'text-green-500'
          },
          {
            id: '100-1193',
            name: 'Comité Primario PCC VR Producción',
            color: 'text-green-500'
          },
          {
            id: '100-1194',
            name: 'Comité Primario PCC FTE',
            color: 'text-green-500'
          },
          {
            id: '100-1195',
            name: 'Comité Primario PCC VR Formación',
            color: 'text-green-500'
          },
          {
            id: '100-1196',
            name: 'Núcleo Complejo Residencial',
            color: 'text-blue-500'
          },
          {
            id: '100-1197',
            name: 'Comité Primario PCC Facultad 4',
            color: 'text-green-500'
          },
          {
            id: '100-1198',
            name: 'Comité Primario PCC Facultad 1',
            color: 'text-green-500'
          },
          {
            id: '100-1199',
            name: 'Comité Primario PCC Facultad 3',
            color: 'text-green-500'
          }
        ]
      },
      {
        id: '100-036',
        name: 'Núcleo Militantes en el Exterior',
        color: 'text-red-500'
      }
    ]
  },
  {
    id: '100-004',
    name: 'Central de Trabajadores de Cuba',
    color: 'text-red-600',
    children: [
      {
        id: '100-037',
        name: 'Comité CTC-UCI',
        color: 'text-red-500'
      }
    ]
  },
  {
    id: '100-005',
    name: 'Unión de Jóvenes Comunistas',
    color: 'text-red-600'
  }
];

const ActionButtons = () => (
  <div className="flex justify-end space-x-1">
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
      <FileText className="h-4 w-4 text-gray-600" />
    </Button>
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
      <Layers className="h-4 w-4 text-gray-600" />
    </Button>
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
      <FileUp className="h-4 w-4 text-gray-600" />
    </Button>
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
      <Link2 className="h-4 w-4 text-gray-600" />
    </Button>
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
      <Edit className="h-4 w-4 text-gray-600" />
    </Button>
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
      <Book className="h-4 w-4 text-gray-600" />
    </Button>
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
      <User className="h-4 w-4 text-gray-600" />
    </Button>
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
      <Eye className="h-4 w-4 text-gray-600" />
    </Button>
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
      <Settings className="h-4 w-4 text-gray-600" />
    </Button>
  </div>
);

const StructureRow = ({ structure, level = 0, isExpanded, onToggle }: { 
  structure: Structure; 
  level?: number;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  const hasChildren = structure.children && structure.children.length > 0;
  const paddingLeft = level * 24;

  return (
    <>
      <TableRow className="hover:bg-gray-50 transition-colors">
        <TableCell>
          <div className="flex items-center" style={{ paddingLeft: `${paddingLeft}px` }}>
            {hasChildren ? (
              <button
                onClick={onToggle}
                className="p-1 hover:bg-gray-100 rounded mr-2"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                )}
              </button>
            ) : (
              <span className="w-6" />
            )}
            <div className="flex items-center">
              <span className={structure.color}>{structure.id}</span>
              <span className={structure.color}>-</span>
              <span className={structure.color}>{structure.name}</span>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right">
          <ActionButtons />
        </TableCell>
      </TableRow>
      {isExpanded && structure.children?.map((child) => (
        <StructureRow
          key={child.id}
          structure={child}
          level={level + 1}
          isExpanded={false}
          onToggle={() => {}}
        />
      ))}
    </>
  );
};

const UIDemo = () => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">UI Component Library</h1>

      <Tabs defaultValue="structures" className="w-full mb-8">
        <TabsList className="mb-4">
          <TabsTrigger value="structures">Structures Table</TabsTrigger>
          <TabsTrigger value="buttons">Buttons</TabsTrigger>
          <TabsTrigger value="cards">Cards</TabsTrigger>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="dialogs">Dialogs</TabsTrigger>
          <TabsTrigger value="avatars">Avatars</TabsTrigger>
          <TabsTrigger value="dropdowns">Dropdowns</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
        </TabsList>

        <TabsContent value="structures">
          <div className="bg-white rounded-lg shadow">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">Nombres de las estructuras</h2>
              <div className="text-sm text-gray-600">Opciones</div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[80%]">Nombre</TableHead>
                  <TableHead className="w-[20%] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {structures.map((structure) => (
                  <StructureRow
                    key={structure.id}
                    structure={structure}
                    isExpanded={expandedRows[structure.id]}
                    onToggle={() => toggleRow(structure.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="buttons" className="space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Buttons</h2>
          <div className="flex flex-wrap gap-4">
            <Button>Default Button</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </TabsContent>

        <TabsContent value="cards" className="space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Card Title</CardTitle>
                <CardDescription>Card Description</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Card content goes here. This is a basic card example.</p>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="ghost">Cancel</Button>
                <Button>Submit</Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Profile</CardTitle>
                <CardDescription>Manage your account settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Avatar>
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>CN</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">John Doe</p>
                    <p className="text-sm text-muted-foreground">john@example.com</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="inputs" className="space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Inputs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" placeholder="Enter your email" type="email" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" placeholder="Enter your password" type="password" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Select>
                  <SelectTrigger id="country">
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="us">United States</SelectItem>
                    <SelectItem value="ca">Canada</SelectItem>
                    <SelectItem value="mx">Mexico</SelectItem>
                    <SelectItem value="uk">United Kingdom</SelectItem>
                    <SelectItem value="fr">France</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button className="w-full">Submit</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dialogs" className="space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Dialogs</h2>
          <div className="flex flex-wrap gap-4">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Profile</DialogTitle>
                  <DialogDescription>
                    Make changes to your profile here. Click save when you're done.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                      Name
                    </Label>
                    <Input id="name" defaultValue="John Doe" className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="username" className="text-right">
                      Username
                    </Label>
                    <Input id="username" defaultValue="@johndoe" className="col-span-3" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Save changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="avatars" className="space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Avatars</h2>
          <div className="flex flex-wrap gap-4 items-center">
            <Avatar>
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            
            <Avatar>
              <AvatarImage src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=256&q=80" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            
            <Avatar>
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            
            <Avatar className="h-16 w-16">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            
            <Avatar className="h-8 w-8">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
          </div>
        </TabsContent>

        <TabsContent value="dropdowns" className="space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Dropdown Menus</h2>
          <div className="flex flex-wrap gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Open Menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Bell className="mr-2 h-4 w-4" />
                  <span>Notifications</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TabsContent>

        <TabsContent value="tables" className="space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Tables</h2>
          <div className="rounded-md border">
            <Table>
              <TableCaption>A list of recent invoices</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">INV001</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                      Paid
                    </span>
                  </TableCell>
                  <TableCell>Credit Card</TableCell>
                  <TableCell className="text-right">$250.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">INV002</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">
                      Pending
                    </span>
                  </TableCell>
                  <TableCell>PayPal</TableCell>
                  <TableCell className="text-right">$150.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">INV003</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-800">
                      Overdue
                    </span>
                  </TableCell>
                  <TableCell>Bank Transfer</TableCell>
                  <TableCell className="text-right">$350.00</TableCell>
                </TableRow>
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">$750.00</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UIDemo;